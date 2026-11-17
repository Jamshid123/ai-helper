import { Inject, Injectable, Logger } from '@nestjs/common'
import { Clock } from '../../../common/clock'
import { PrismaService } from '../../../prisma/prisma.service'
import { PAYMENT_GATEWAY, type PaymentGateway } from '../payment-provider'
import { PaymentsService, type PayableRefusal } from '../payments.service'
import { RefundsService } from '../refunds.service'
import { clickSignValid, parseClickAmount } from './click-sign'
import type { ClickProvider } from './click.provider'

/** Коды ответа поставщика (docs.click.uz/shop-api/errors). */
const E = {
  OK: [0, 'Success'],
  SIGN: [-1, 'SIGN CHECK FAILED!'],
  AMOUNT: [-2, 'Incorrect parameter amount'],
  ACTION: [-3, 'Action not found'],
  PAID: [-4, 'Already paid'],
  ORDER: [-5, 'User does not exist'],
  TX: [-6, 'Transaction does not exist'],
  REQUEST: [-8, 'Error in request from click'],
  CANCELLED: [-9, 'Transaction cancelled'],
} as const

const REFUSAL: Record<PayableRefusal, readonly [number, string]> = {
  NOT_FOUND: E.ORDER,
  PAID: E.PAID,
  CANCELLED: E.CANCELLED,
  // заказ есть, но оплатить его сейчас нельзя (срок 10% истёк, торги закрыты, мест нет) — для Click это «нет заказа»
  CLOSED: [-5, 'Payment is no longer possible for this order'],
  BUSY: [-5, 'Payment for this order is already in progress'],
}

type Reply = Record<string, string | number>

/**
 * Click SHOP API: Click спрашивает нас «можно ли оплатить» (Prepare, action=0) и сообщает «оплачено» (Complete,
 * action=1). Подпись MD5 с секретным ключом проверяется у каждого запроса. Решения о деньгах — в PaymentsService.
 */
@Injectable()
export class ClickService {
  private readonly log = new Logger(ClickService.name)
  /** Пауза перед возвратом: Click разрешает отмену только завершённого платежа — после нашего ответа на Complete. */
  refundDelayMs = 5_000

  constructor(
    private readonly prisma: PrismaService,
    private readonly payments: PaymentsService,
    private readonly refunds: RefundsService,
    private readonly clock: Clock,
    @Inject(PAYMENT_GATEWAY) private readonly gateway: PaymentGateway,
    @Inject('CLICK_CONFIG') private readonly cfg: { serviceId: number; secretKey: string } | null
  ) {}

  async handle(raw: unknown): Promise<Reply> {
    const b = toStrings(raw)
    const base = { click_trans_id: b.click_trans_id ?? '', merchant_trans_id: b.merchant_trans_id ?? '' }
    const reply = (e: readonly [number, string], extra: Reply = {}) => ({ ...base, ...extra, error: e[0], error_note: e[1] })
    if (!this.cfg) return reply(E.REQUEST)
    const required = ['click_trans_id', 'service_id', 'merchant_trans_id', 'amount', 'action', 'sign_time', 'sign_string']
    if (required.some((k) => !b[k])) return reply(E.REQUEST)
    if (!clickSignValid(b, this.cfg.secretKey)) return reply(E.SIGN)
    if (b.service_id !== String(this.cfg.serviceId)) return reply(E.REQUEST)
    const amount = parseClickAmount(b.amount)
    if (amount === null || amount <= 0n) return reply(E.AMOUNT)
    if (!/^[0-9a-f-]{36}$/i.test(b.merchant_trans_id)) return reply(E.ORDER)
    if (b.action === '0') return this.prepare(b, amount, reply)
    if (b.action === '1') return this.complete(b, amount, reply)
    return reply(E.ACTION)
  }

  private async prepare(b: Record<string, string>, amount: bigint, reply: ReplyFn): Promise<Reply> {
    const now = this.clock.now()
    const same = await this.prisma.paymentTransaction.findUnique({
      where: { provider_externalId: { provider: 'click', externalId: b.click_trans_id } },
    })
    if (same) {
      // повтор Prepare (Click не получил наш ответ)
      if (same.state === 1 && same.orderId === b.merchant_trans_id) return reply(E.OK, { merchant_prepare_id: same.id })
      return reply(same.state === 2 ? E.PAID : E.CANCELLED)
    }
    const check = await this.payments.payable(b.merchant_trans_id, now)
    if (!check.ok) return reply(REFUSAL[check.reason])
    if (check.amount !== amount) return reply(E.AMOUNT)
    // Click не присылает отмену брошенной оплаты: создаём транзакцию; она «держит» заказ не дольше PAYMENT_LOCK_MS.
    const tx = await this.prisma.paymentTransaction.create({
      data: {
        provider: 'click',
        externalId: b.click_trans_id,
        orderId: b.merchant_trans_id,
        amount,
        paymentRef: b.click_paydoc_id || null,
        createdAt: now,
      },
    })
    return reply(E.OK, { merchant_prepare_id: tx.id })
  }

  private async complete(b: Record<string, string>, amount: bigint, reply: ReplyFn): Promise<Reply> {
    const prepareId = Number(b.merchant_prepare_id)
    const tx = Number.isSafeInteger(prepareId)
      ? await this.prisma.paymentTransaction.findUnique({
          where: { provider_externalId: { provider: 'click', externalId: b.click_trans_id } },
        })
      : null
    if (!tx || tx.id !== prepareId || tx.orderId !== b.merchant_trans_id) return reply(E.TX)
    if (tx.amount !== amount) return reply(E.AMOUNT)
    if (tx.state === 2) return reply(E.PAID, { merchant_confirm_id: tx.id })
    if (tx.state < 0) return reply(E.CANCELLED)

    const now = this.clock.now()
    // Click сообщает об ошибке списания (error < 0) — отменяем транзакцию у себя и отвечаем -9 (так требует Click)
    if (Number(b.error ?? 0) < 0) {
      await this.prisma.paymentTransaction.updateMany({
        where: { id: tx.id, state: 1 },
        data: { state: -1, reason: 2, cancelledAt: now },
      })
      return reply(E.CANCELLED)
    }

    // Деньги списаны: ответ на Complete не может быть ошибкой (docs.click.uz) — если оплату принять нельзя
    // (срок прошёл, мест нет, уже оплачено), отвечаем «успешно» и возвращаем деньги отменой платежа.
    const won = await this.prisma.paymentTransaction.updateMany({
      where: { id: tx.id, state: 1 },
      data: { state: 2, performedAt: now, paymentRef: b.click_paydoc_id || tx.paymentRef },
    })
    if (!won.count) return reply(E.PAID, { merchant_confirm_id: tx.id })
    const outcome = await this.payments.confirmPayment({
      orderId: tx.orderId,
      provider: 'click',
      providerTxId: `click:${tx.externalId}`,
      amount: tx.amount,
      paidAt: now,
      startedAt: tx.createdAt,
    })
    if (outcome === 'ALREADY_PROCESSED' || outcome === 'AMOUNT_MISMATCH') {
      // заказ уже оплачен другой транзакцией — эту возвращаем целиком
      await this.prisma.paymentTransaction.update({ where: { id: tx.id }, data: { needsRefund: true } })
      this.later(() => (this.gateway.pick('click') as ClickProvider).reverse(tx.id, `дубль ${tx.orderId}`))
    } else if (outcome.startsWith('REFUND_')) {
      this.later(() => this.refunds.settle([tx.orderId]))
    }
    this.log.log(`Click Complete ${tx.orderId}: ${outcome}`)
    return reply(E.OK, { merchant_confirm_id: tx.id })
  }

  private later(job: () => Promise<unknown>) {
    setTimeout(() => job().catch((e) => this.log.error(`Возврат Click не проведён: ${(e as Error).message}`)), this.refundDelayMs)
  }
}

type ReplyFn = (e: readonly [number, string], extra?: Reply) => Reply

function toStrings(raw: unknown): Record<string, string> {
  const out: Record<string, string> = {}
  if (raw && typeof raw === 'object') {
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      if (typeof v === 'string' || typeof v === 'number') out[k] = String(v)
    }
  }
  return out
}
