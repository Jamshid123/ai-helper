import { Inject, Injectable, NotFoundException } from '@nestjs/common'
import type { Category, Lot, Prisma } from '@prisma/client'
import { RULES, currentOrNextSession } from '@auksion/shared'
import { Clock } from '../../common/clock'
import { ENV } from '../../config/config.module'
import type { Env } from '../../config/env'
import { PrismaService } from '../../prisma/prisma.service'
import { RefundsService } from '../payments/refunds.service'
import { AuditService } from '../staff/audit.service'
import { conflict, unprocessable } from './admin.schemas'

/** Взнос за допуск по умолчанию (решение заказчика: 12 000 сум, меняется для лота). */
export const DEFAULT_FEE = 12_000n

export type LotInput = {
  title?: string
  description?: string
  inspection?: Prisma.InputJsonValue
  startPrice?: bigint
  step?: bigint
  fee?: bigint
  opensAt?: Date
  closesAt?: Date
}
type Actor = { staffId: string; ip: string | null }
type LotFull = Lot & { category: Pick<Category, 'slug' | 'nameRu'> }

export const lotDto = (l: LotFull) => ({
  id: l.id,
  status: l.status,
  title: l.title,
  description: l.description,
  condition: l.condition,
  categoryId: l.categoryId,
  category: l.category.slug,
  categoryName: l.category.nameRu,
  productId: l.productId,
  startPrice: l.startPrice.toString(),
  step: l.step.toString(),
  fee: l.fee.toString(),
  currentPrice: l.currentPrice?.toString() ?? null,
  admittedCount: l.admittedCount,
  lastSeq: l.lastSeq,
  inspection: l.inspection,
  opensAt: l.opensAt.toISOString(),
  closesAt: l.closesAt.toISOString(),
  createdAt: l.createdAt.toISOString(),
})
const include = { category: { select: { slug: true, nameRu: true } } } as const

/**
 * Лоты в админке. Правила: шаг ≥ минимального (ТЗ), старт не ниже себестоимости (решение 13.11.2026),
 * на проде — только пятничный слот 09:00–18:00 по Ташкенту (на демо-стенде — любое окно в будущем),
 * после открытия торгов лот не меняется (ТЗ «Защита от подмены»).
 */
@Injectable()
export class AdminLotsService {
  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly refunds: RefundsService,
    private readonly clock: Clock
  ) {}

  async list(status?: Lot['status']) {
    const lots = await this.prisma.lot.findMany({
      where: status ? { status } : {},
      include,
      orderBy: { opensAt: 'desc' },
      take: 300,
    })
    return lots.map(lotDto)
  }

  async one(id: string) {
    const l = await this.prisma.lot.findUnique({ where: { id }, include })
    if (!l) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Лот не найден' })
    return lotDto(l)
  }

  async create(
    productId: string,
    input: Required<Pick<LotInput, 'startPrice' | 'step' | 'opensAt' | 'closesAt'>> & LotInput,
    actor: Actor
  ) {
    const product = await this.prisma.product.findUnique({ where: { id: productId } })
    if (!product) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Товар не найден' })
    const values = { fee: DEFAULT_FEE, ...input }
    this.validate(values, product.costPrice)
    const lot = await this.prisma.$transaction(async (tx) => {
      // товар — только в один активный лот (условное обновление защищает от гонки)
      const taken = await tx.product.updateMany({
        where: { id: productId, status: 'AVAILABLE' },
        data: { status: 'IN_LOT' },
      })
      if (taken.count === 0) throw conflict('PRODUCT_NOT_AVAILABLE', 'Товар уже в лоте или недоступен')
      const l = await tx.lot.create({
        data: {
          productId,
          categoryId: product.categoryId,
          title: values.title ?? product.title,
          description: values.description ?? product.description,
          condition: product.condition,
          inspection: values.inspection ?? (product.inspection as Prisma.InputJsonValue),
          startPrice: values.startPrice,
          step: values.step,
          fee: values.fee,
          opensAt: values.opensAt,
          closesAt: values.closesAt,
          status: 'DRAFT',
        },
        include,
      })
      await this.audit.log(
        {
          actorType: 'staff',
          actorId: actor.staffId,
          action: 'lot.created',
          entityType: 'lot',
          entityId: l.id,
          ip: actor.ip,
          meta: { productId },
        },
        tx
      )
      return l
    })
    return lotDto(lot)
  }

  async update(id: string, input: LotInput, actor: Actor) {
    const lot = await this.prisma.$transaction(async (tx) => {
      const l = await this.lockEditable(tx, id)
      const product = l.productId ? await tx.product.findUnique({ where: { id: l.productId } }) : null
      this.validate(
        {
          startPrice: input.startPrice ?? l.startPrice,
          step: input.step ?? l.step,
          fee: input.fee ?? l.fee,
          opensAt: input.opensAt ?? l.opensAt,
          closesAt: input.closesAt ?? l.closesAt,
        },
        product?.costPrice ?? null
      )
      const updated = await tx.lot.update({ where: { id }, data: input, include })
      await this.audit.log(
        {
          actorType: 'staff',
          actorId: actor.staffId,
          action: 'lot.updated',
          entityType: 'lot',
          entityId: id,
          ip: actor.ip,
          meta: { fields: Object.keys(input) },
        },
        tx
      )
      return updated
    })
    return lotDto(lot)
  }

  async publish(id: string, actor: Actor) {
    const lot = await this.prisma.$transaction(async (tx) => {
      const l = await this.lock(tx, id)
      if (l.status !== 'DRAFT') throw conflict('NOT_DRAFT', 'Опубликовать можно только черновик')
      if (l.opensAt <= this.clock.now()) throw unprocessable('LOT_IN_PAST', 'Время начала уже прошло — измените время')
      const updated = await tx.lot.update({ where: { id }, data: { status: 'SCHEDULED' }, include })
      await this.audit.log(
        {
          actorType: 'staff',
          actorId: actor.staffId,
          action: 'lot.published',
          entityType: 'lot',
          entityId: id,
          ip: actor.ip,
        },
        tx
      )
      return updated
    })
    return lotDto(lot)
  }

  /** Отмена до начала торгов: всем участникам — возврат 100%, товар снова на складе. Причина обязательна. */
  async cancel(id: string, reason: string, actor: Actor) {
    const { lot, orderIds } = await this.prisma.$transaction(async (tx) => {
      const l = await this.lock(tx, id)
      if (!['DRAFT', 'SCHEDULED'].includes(l.status) || l.opensAt <= this.clock.now()) {
        throw conflict('LOT_LOCKED', 'Торги уже начались — отменить лот нельзя')
      }
      const orderIds = await this.refunds.revokeAdmissionsInTx(tx, id)
      const updated = await tx.lot.update({
        where: { id },
        data: { status: 'CANCELLED', closedAt: this.clock.now() },
        include,
      })
      if (l.productId) await tx.product.update({ where: { id: l.productId }, data: { status: 'AVAILABLE' } })
      await tx.outboxEvent.create({
        data: { type: 'lot.cancelled', aggregateId: id, payload: { lotId: id, refunds: orderIds.length } },
      })
      await this.audit.log(
        {
          actorType: 'staff',
          actorId: actor.staffId,
          action: 'lot.cancelled',
          entityType: 'lot',
          entityId: id,
          reason,
          ip: actor.ip,
          meta: { refunds: orderIds.length },
        },
        tx
      )
      return { lot: updated, orderIds }
    })
    const refunded = await this.refunds.settle(orderIds)
    return { ...lotDto(lot), refunded, refundPending: orderIds.length - refunded }
  }

  private validate(
    v: Required<Pick<LotInput, 'startPrice' | 'step' | 'opensAt' | 'closesAt' | 'fee'>>,
    costPrice: bigint | null
  ) {
    if (v.step < RULES.MIN_STEP_SUM) throw unprocessable('STEP_TOO_SMALL', `Шаг — не меньше ${RULES.MIN_STEP_SUM} сум`)
    if (costPrice !== null && v.startPrice < costPrice) {
      throw unprocessable('START_BELOW_COST', 'Стартовая цена ниже себестоимости товара')
    }
    if (v.fee < 0n) throw unprocessable('BAD_FEE', 'Взнос не может быть отрицательным')
    if (v.closesAt <= v.opensAt) throw unprocessable('BAD_WINDOW', 'Окончание должно быть позже начала')
    if (v.opensAt <= this.clock.now()) throw unprocessable('LOT_IN_PAST', 'Время начала уже прошло')
    if (!this.env.DEMO_STAND) {
      const s = currentOrNextSession(new Date(v.opensAt.getTime() - 1))
      if (s.opensAt.getTime() !== v.opensAt.getTime() || s.closesAt.getTime() !== v.closesAt.getTime()) {
        throw unprocessable('NOT_FRIDAY_SLOT', 'Торги — только в пятницу с 09:00 до 18:00 по Ташкенту')
      }
    }
  }

  private async lock(tx: Prisma.TransactionClient, id: string): Promise<Lot> {
    await tx.$queryRaw`SELECT id FROM "Lot" WHERE id = ${id}::uuid FOR UPDATE`
    const l = await tx.lot.findUnique({ where: { id } })
    if (!l) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Лот не найден' })
    return l
  }

  private async lockEditable(tx: Prisma.TransactionClient, id: string): Promise<Lot> {
    const l = await this.lock(tx, id)
    const beforeOpen = l.opensAt > this.clock.now()
    if (l.status === 'DRAFT' && beforeOpen) return l
    if (l.status === 'SCHEDULED' && beforeOpen) {
      if (l.admittedCount > 0) {
        throw conflict('LOT_HAS_PARTICIPANTS', 'У лота уже есть участники — сначала отмените их допуски с возвратом')
      }
      return l
    }
    throw conflict('LOT_LOCKED', 'После открытия торгов лот не меняется')
  }
}
