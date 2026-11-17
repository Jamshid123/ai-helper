import { timingSafeEqual } from 'node:crypto'
import { Inject, Injectable, Logger } from '@nestjs/common'
import type { PaymentTransaction } from '@prisma/client'
import { Clock } from '../../../common/clock'
import { PrismaService } from '../../../prisma/prisma.service'
import { PaymentsService, type PayableRefusal } from '../payments.service'

export type PaymeConfig = { merchantId: string; key: string; checkIp: boolean; testMode: boolean }

/** Payme отправляет запросы только с этих адресов (developer.help.paycom.uz, «Схема взаимодействия»). */
export const PAYME_IPS = new Set(Array.from({ length: 15 }, (_, i) => `185.234.113.${i + 1}`))
/** Транзакция, не проведённая за 12 часов, отменяется (reason 4). */
const TIMEOUT_MS = 12 * 3_600_000

type Msg = { ru: string; uz: string; en: string }
const m = (ru: string, uz: string, en: string): Msg => ({ ru, uz, en })

class RpcError extends Error {
  constructor(
    readonly code: number,
    readonly msg: Msg,
    readonly data?: string
  ) {
    super(msg.en)
  }
}

const ERR = {
  auth: () => new RpcError(-32504, m('Недостаточно привилегий', 'Ruxsat yetarli emas', 'Insufficient privileges')),
  parse: () => new RpcError(-32700, m('Ошибка разбора JSON', 'JSON xatosi', 'Parse error')),
  request: () => new RpcError(-32600, m('Неверный запрос', 'Noto‘g‘ri so‘rov', 'Invalid request')),
  method: () => new RpcError(-32601, m('Метод не найден', 'Metod topilmadi', 'Method not found')),
  amount: () => new RpcError(-31001, m('Неверная сумма', 'Noto‘g‘ri summa', 'Incorrect amount')),
  notFound: () => new RpcError(-31003, m('Транзакция не найдена', 'Tranzaksiya topilmadi', 'Transaction not found')),
  cantCancel: () =>
    new RpcError(-31007, m('Заказ выполнен, отменить нельзя', 'Buyurtma bajarilgan', 'Order completed, cannot cancel')),
  cantPerform: () =>
    new RpcError(-31008, m('Невозможно выполнить операцию', 'Amalni bajarib bo‘lmaydi', 'Unable to perform operation')),
}

const REFUSAL: Record<PayableRefusal, [number, Msg]> = {
  NOT_FOUND: [-31050, m('Заказ не найден', 'Buyurtma topilmadi', 'Order not found')],
  PAID: [-31051, m('Заказ уже оплачен', 'Buyurtma allaqachon to‘langan', 'Order already paid')],
  CANCELLED: [-31052, m('Заказ отменён', 'Buyurtma bekor qilingan', 'Order cancelled')],
  CLOSED: [-31053, m('Срок оплаты истёк', 'To‘lov muddati tugagan', 'Payment period has expired')],
  BUSY: [-31099, m('Заказ уже оплачивается', 'Buyurtma to‘lanmoqda', 'Order payment is in progress')],
}

const refusal = (r: PayableRefusal) => new RpcError(REFUSAL[r][0], REFUSAL[r][1], 'order_id')

type Params = Record<string, unknown>
const ms = (d: Date | null | undefined) => (d ? d.getTime() : 0)

/**
 * Payme Merchant API (JSON-RPC 2.0): Payme спрашивает, можно ли оплатить заказ, создаёт, проводит и отменяет
 * транзакции. Авторизация — ключ кассы в Basic + адреса Payme. Деньги считаются в тийинах, у нас — в сумах.
 * Возврат: финансы делают его в кабинете Payme, Payme присылает CancelTransaction — заказ становится REFUNDED.
 * Отменить проведённую транзакцию без нашего решения о возврате нельзя (-31007).
 */
@Injectable()
export class PaymeService {
  private readonly log = new Logger(PaymeService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly payments: PaymentsService,
    private readonly clock: Clock,
    @Inject('PAYME_CONFIG') private readonly cfg: PaymeConfig | null
  ) {}

  /** Обрабатывает один RPC-запрос; ответ всегда HTTP 200 (иначе Payme считает это ошибкой -32400). */
  async handle(body: unknown, authorization: string | undefined, ip: string): Promise<object> {
    let id: unknown = null
    try {
      if (!this.cfg || !this.authorized(authorization, ip)) throw ERR.auth()
      const req = typeof body === 'string' ? parseJson(body) : body
      if (!req || typeof req !== 'object') throw ERR.request()
      const { method, params } = req as { method?: unknown; params?: unknown }
      id = (req as { id?: unknown }).id ?? null
      if (typeof method !== 'string' || !params || typeof params !== 'object') throw ERR.request()
      const result = await this.dispatch(method, params as Params)
      return { jsonrpc: '2.0', id, result }
    } catch (e) {
      if (e instanceof RpcError) return { jsonrpc: '2.0', id, error: { code: e.code, message: e.msg, data: e.data } }
      this.log.error(`Payme: ${(e as Error).message}`)
      return { jsonrpc: '2.0', id, error: { code: -32400, message: m('Системная ошибка', 'Tizim xatosi', 'System error') } }
    }
  }

  private authorized(header: string | undefined, ip: string): boolean {
    if (this.cfg!.checkIp && !PAYME_IPS.has(ip)) return false
    if (!header?.startsWith('Basic ')) return false
    const decoded = Buffer.from(header.slice(6), 'base64').toString('utf8')
    const password = decoded.slice(decoded.indexOf(':') + 1)
    const a = Buffer.from(password)
    const b = Buffer.from(this.cfg!.key)
    return decoded.includes(':') && a.length === b.length && timingSafeEqual(a, b)
  }

  private dispatch(method: string, p: Params): Promise<object> {
    switch (method) {
      case 'CheckPerformTransaction':
        return this.checkPerform(p)
      case 'CreateTransaction':
        return this.create(p)
      case 'PerformTransaction':
        return this.perform(p)
      case 'CancelTransaction':
        return this.cancel(p)
      case 'CheckTransaction':
        return this.check(p)
      case 'GetStatement':
        return this.statement(p)
      case 'SetFiscalData':
        return this.fiscal(p)
      default:
        throw ERR.method()
    }
  }

  /** Сумма в тийинах → сумы (целые, кратные 100), иначе — неверная сумма. */
  private sums(p: Params): bigint {
    const a = p.amount
    if (typeof a !== 'number' || !Number.isSafeInteger(a) || a <= 0 || a % 100 !== 0) throw ERR.amount()
    return BigInt(a / 100)
  }

  private orderId(p: Params): string {
    const acc = p.account as { order_id?: unknown } | undefined
    const id = acc?.order_id
    if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/i.test(id)) throw refusal('NOT_FOUND')
    return id
  }

  private async checkPerform(p: Params) {
    const amount = this.sums(p)
    const check = await this.payments.payable(this.orderId(p), this.clock.now())
    if (!check.ok) throw refusal(check.reason)
    if (check.amount !== amount) throw ERR.amount()
    return { allow: true }
  }

  private async create(p: Params) {
    const externalId = this.txId(p)
    const now = this.clock.now()
    const existing = await this.find(externalId)
    if (existing) {
      if (existing.state !== 1) throw ERR.cantPerform()
      if (await this.timedOut(existing, now)) throw ERR.cantPerform()
      return { create_time: ms(existing.createdAt), transaction: String(existing.id), state: existing.state }
    }
    const amount = this.sums(p)
    const orderId = this.orderId(p)
    const check = await this.payments.payable(orderId, now)
    if (!check.ok) throw refusal(check.reason)
    if (check.amount !== amount) throw ERR.amount()
    const time = typeof p.time === 'number' ? new Date(p.time) : now
    const tx = await this.prisma.paymentTransaction.create({
      data: { provider: 'payme', externalId, orderId, amount, providerTime: time, createdAt: now },
    })
    return { create_time: ms(tx.createdAt), transaction: String(tx.id), state: 1 }
  }

  private async perform(p: Params) {
    const tx = await this.find(this.txId(p))
    if (!tx) throw ERR.notFound()
    const now = this.clock.now()
    if (tx.state === 2) return { transaction: String(tx.id), perform_time: ms(tx.performedAt), state: 2 }
    if (tx.state !== 1 || (await this.timedOut(tx, now))) throw ERR.cantPerform()

    const won = await this.prisma.paymentTransaction.updateMany({
      where: { id: tx.id, state: 1 },
      data: { state: 2, performedAt: now },
    })
    if (won.count) {
      const outcome = await this.payments.confirmPayment({
        orderId: tx.orderId,
        provider: 'payme',
        providerTxId: `payme:${tx.externalId}`,
        amount: tx.amount,
        paidAt: now,
        startedAt: tx.createdAt,
      })
      // Деньги уже списаны. Если оплату принять нельзя (поздно, мест нет) — заказ уходит на возврат (REFUND_PENDING);
      // если заказ уже оплачен другой транзакцией — помечаем эту к возврату. Возврат проводят финансы в кабинете Payme.
      if (outcome === 'ALREADY_PROCESSED' || outcome === 'AMOUNT_MISMATCH') {
        await this.prisma.paymentTransaction.update({ where: { id: tx.id }, data: { needsRefund: true } })
      }
      this.log.log(`Payme Perform ${tx.orderId}: ${outcome}`)
    }
    const fresh = (await this.find(tx.externalId))!
    return { transaction: String(fresh.id), perform_time: ms(fresh.performedAt), state: fresh.state }
  }

  private async cancel(p: Params) {
    const tx = await this.find(this.txId(p))
    if (!tx) throw ERR.notFound()
    const reason = typeof p.reason === 'number' ? p.reason : null
    const now = this.clock.now()
    if (tx.state === 1) {
      await this.prisma.paymentTransaction.updateMany({
        where: { id: tx.id, state: 1 },
        data: { state: -1, reason, cancelledAt: now },
      })
    } else if (tx.state === 2) {
      // Возврат по проведённой: только если мы сами решили вернуть (заказ на возврате или эта оплата — дубль).
      const order = await this.prisma.order.findUnique({ where: { id: tx.orderId } })
      const ours = order?.providerTxId === `payme:${tx.externalId}`
      if (!tx.needsRefund && !(ours && order?.status === 'REFUND_PENDING')) throw ERR.cantCancel()
      await this.prisma.$transaction(async (db) => {
        await db.paymentTransaction.update({
          where: { id: tx.id },
          data: { state: -2, reason, cancelledAt: now, needsRefund: false },
        })
        if (ours) {
          await db.order.updateMany({ where: { id: tx.orderId, status: 'REFUND_PENDING' }, data: { status: 'REFUNDED' } })
        }
        await db.auditLog.create({
          data: {
            actorType: 'SYSTEM',
            action: 'payment.refunded',
            entityType: 'Order',
            entityId: tx.orderId,
            meta: { provider: 'payme', transaction: tx.id },
          },
        })
      })
    }
    const fresh = (await this.find(tx.externalId))!
    return { transaction: String(fresh.id), cancel_time: ms(fresh.cancelledAt), state: fresh.state }
  }

  private async check(p: Params) {
    const tx = await this.find(this.txId(p))
    if (!tx) throw ERR.notFound()
    return {
      create_time: ms(tx.createdAt),
      perform_time: ms(tx.performedAt),
      cancel_time: ms(tx.cancelledAt),
      transaction: String(tx.id),
      state: tx.state,
      reason: tx.reason,
    }
  }

  private async statement(p: Params) {
    if (typeof p.from !== 'number' || typeof p.to !== 'number') throw ERR.request()
    const list = await this.prisma.paymentTransaction.findMany({
      where: { provider: 'payme', providerTime: { gte: new Date(p.from), lte: new Date(p.to) } },
      orderBy: { providerTime: 'asc' },
    })
    return {
      transactions: list.map((tx) => ({
        id: tx.externalId,
        time: ms(tx.providerTime),
        amount: Number(tx.amount * 100n),
        account: { order_id: tx.orderId },
        create_time: ms(tx.createdAt),
        perform_time: ms(tx.performedAt),
        cancel_time: ms(tx.cancelledAt),
        transaction: String(tx.id),
        state: tx.state,
        reason: tx.reason,
      })),
    }
  }

  /** Данные фискального чека от Payme — пока только в журнал (ссылка на чек понадобится в разделе «Платежи»). */
  private async fiscal(p: Params) {
    const data = (p.fiscal_data ?? {}) as { qr_code_url?: unknown; status_code?: unknown }
    this.log.log(`Payme SetFiscalData ${String(p.id)} ${String(p.type)}: ${String(data.status_code)}`)
    return { success: true }
  }

  private txId(p: Params): string {
    if (typeof p.id !== 'string' || !p.id || p.id.length > 64) throw ERR.request()
    return p.id
  }

  private find(externalId: string) {
    return this.prisma.paymentTransaction.findUnique({
      where: { provider_externalId: { provider: 'payme', externalId } },
    })
  }

  /** Не проведена за 12 часов → отмена по таймауту (reason 4). */
  private async timedOut(tx: PaymentTransaction, now: Date): Promise<boolean> {
    const start = tx.providerTime ?? tx.createdAt
    if (now.getTime() - start.getTime() < TIMEOUT_MS) return false
    await this.prisma.paymentTransaction.updateMany({
      where: { id: tx.id, state: 1 },
      data: { state: -1, reason: 4, cancelledAt: now },
    })
    return true
  }
}

function parseJson(s: string): unknown {
  try {
    return JSON.parse(s)
  } catch {
    throw ERR.parse()
  }
}
