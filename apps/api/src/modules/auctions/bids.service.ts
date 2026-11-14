import { randomUUID } from 'node:crypto'
import { Injectable } from '@nestjs/common'
import { Prisma, type Bid } from '@prisma/client'
import { minNextBid } from '@auksion/shared'
import { Clock } from '../../common/clock'
import { PrismaService } from '../../prisma/prisma.service'
import { BidRejectedError } from './bid.errors'

type LockedLotRow = {
  id: string
  status: string
  start_price: bigint
  step: bigint
  current_price: bigint | null
  leader_user_id: string | null
  last_seq: number
  opens_at: Date
  closes_at: Date
}

/** Состояние лота внутри транзакции (под блокировкой), меняется по мере записи предложений. */
type LotState = {
  id: string
  status: string
  startPrice: bigint
  step: bigint
  currentPrice: bigint | null
  leaderUserId: string | null
  lastSeq: number
  opensAt: Date
  closesAt: Date
}

export type BidResult = {
  bid: Pick<Bid, 'id' | 'seq' | 'amount' | 'createdAt'>
  currentPrice: bigint
  minNextBid: bigint
  replayed: boolean
}

export type AutoBidResult = { maxAmount: bigint; active: boolean; currentPrice: bigint | null; leading: boolean }

/** Предохранитель от бесконечного цикла автопредложений (каждый шаг поднимает цену, так что он не должен срабатывать). */
const MAX_PROXY_ROUNDS = 200

/**
 * Приём предложений цены (ТЗ «Принятие ставки») и автопредложения до максимума.
 * Всё в одной транзакции: блокировка строки лота (FOR UPDATE) → проверки по актуальному состоянию →
 * запись с монотонным seq → автопредложения других участников → события в outbox.
 */
@Injectable()
export class BidsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock
  ) {}

  // ───────────── ручное предложение ─────────────

  async placeBid(userId: string, lotId: string, amount: bigint, idempotencyKey: string): Promise<BidResult> {
    try {
      return await this.tx((tx) => this.placeInTx(tx, userId, lotId, amount, idempotencyKey))
    } catch (e) {
      // Гонка двух запросов с одним ключом: второй упирается в уникальный индекс → исходный результат.
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        const existing = await this.findReplay(userId, idempotencyKey)
        if (existing) return existing
      }
      throw e
    }
  }

  private async placeInTx(tx: Prisma.TransactionClient, userId: string, lotId: string, amount: bigint, key: string) {
    const replay = await this.findReplay(userId, key, tx)
    if (replay) return replay

    const lot = await this.lockLot(tx, lotId)
    // Повторная проверка ключа под блокировкой: параллельный запрос с тем же ключом мог закоммитить.
    const replayAfterLock = await this.findReplay(userId, key, tx)
    if (replayAfterLock) return replayAfterLock

    const min = this.minOf(lot)
    const now = this.clock.now()
    this.assertOpen(lot, now, min)
    await this.assertMayBid(tx, lot, userId, now, min)
    if (amount < min) throw new BidRejectedError('BID_TOO_LOW', min)

    const bid = await this.insertBid(tx, lot, userId, amount, key, now, false)
    await this.resolveProxies(tx, lot, now)
    return { bid, currentPrice: lot.currentPrice!, minNextBid: this.minOf(lot), replayed: false } satisfies BidResult
  }

  // ───────────── автопредложение ─────────────

  /** Установить/изменить максимум. Если торги идут — сразу предлагает за участника, когда нужно. */
  async setAutoBid(userId: string, lotId: string, maxAmount: bigint): Promise<AutoBidResult> {
    return this.tx(async (tx) => {
      const lot = await this.lockLot(tx, lotId)
      const now = this.clock.now()
      const min = this.minOf(lot)
      if (now >= lot.closesAt) throw new BidRejectedError('LOT_CLOSED', min)
      if (!['SCHEDULED', 'LIVE'].includes(lot.status)) throw new BidRejectedError('LOT_NOT_LIVE', min)
      await this.assertMayBid(tx, lot, userId, now, min, { allowLeader: true })
      if (maxAmount < min) throw new BidRejectedError('BID_TOO_LOW', min)

      const auto = await tx.autoBid.upsert({
        where: { lotId_userId: { lotId, userId } },
        create: { lotId, userId, maxAmount },
        update: { maxAmount, active: true },
      })
      if (lot.status === 'LIVE' && now >= lot.opensAt) await this.resolveProxies(tx, lot, now)
      const fresh = await tx.autoBid.findUniqueOrThrow({ where: { id: auto.id } })
      return {
        maxAmount: fresh.maxAmount,
        active: fresh.active,
        currentPrice: lot.currentPrice,
        leading: lot.leaderUserId === userId,
      }
    })
  }

  async cancelAutoBid(userId: string, lotId: string): Promise<void> {
    await this.prisma.autoBid.updateMany({ where: { lotId, userId }, data: { active: false } })
  }

  /**
   * Ход торгов для комнаты: последние предложения (новые сверху) и минимальная следующая цена.
   * Участники — только публичным именем; «mine» — для подсветки своих предложений.
   */
  async history(userId: string, lotId: string, limit = 50) {
    const lot = await this.prisma.lot.findFirst({
      where: { id: lotId, status: { notIn: ['DRAFT', 'CANCELLED'] } },
      select: { startPrice: true, step: true, currentPrice: true, lastSeq: true },
    })
    if (!lot) throw new BidRejectedError('LOT_NOT_FOUND')
    const bids = await this.prisma.bid.findMany({
      where: { lotId },
      orderBy: { seq: 'desc' },
      take: limit,
      select: { seq: true, amount: true, createdAt: true, userId: true, user: { select: { publicName: true } } },
    })
    return {
      currentPrice: lot.currentPrice?.toString() ?? null,
      minNextBid: this.minOf(lot).toString(),
      lastSeq: lot.lastSeq,
      bids: bids.map((b) => ({
        seq: b.seq,
        amount: b.amount.toString(),
        bidder: b.user.publicName,
        mine: b.userId === userId,
        createdAt: b.createdAt.toISOString(),
      })),
    }
  }

  async getAutoBid(userId: string, lotId: string): Promise<{ maxAmount: bigint; active: boolean } | null> {
    return this.prisma.autoBid.findUnique({
      where: { lotId_userId: { lotId, userId } },
      select: { maxAmount: true, active: true },
    })
  }

  /** Запустить автопредложения по лоту (например, сразу после открытия торгов в 09:00). */
  async runProxies(lotId: string): Promise<void> {
    await this.tx(async (tx) => {
      const lot = await this.lockLot(tx, lotId)
      const now = this.clock.now()
      if (lot.status === 'LIVE' && now >= lot.opensAt && now < lot.closesAt) await this.resolveProxies(tx, lot, now)
    })
  }

  /**
   * Разрешение автопредложений (proxy bidding). Пока есть участник (не лидер), чей максимум позволяет
   * предложить минимальную следующую цену, система предлагает за него. Правила:
   *  • претендент сильнее лидера (у лидера нет автопредложения, либо максимум претендента выше, либо равен,
   *    но установлен раньше) → претендент предлагает минимально нужное, чтобы опередить лидера, но ≤ своего максимума;
   *  • лидер сильнее → претендент поднимает цену насколько позволяет его максимум (оставляя лидеру место для шага),
   *    лидер отвечает на шаг выше (≤ своего максимума); если претендент не может ничего предложить — его автопредложение исчерпано.
   * Каждое предложение — обычная запись с seq и событием в ходе торгов; каждое поднимает цену, поэтому цикл конечен.
   */
  private async resolveProxies(tx: Prisma.TransactionClient, lot: LotState, now: Date): Promise<void> {
    const key = () => `auto:${randomUUID()}`
    for (let round = 0; round < MAX_PROXY_ROUNDS; round++) {
      const min = this.minOf(lot)
      const proxies = await tx.autoBid.findMany({
        where: { lotId: lot.id, active: true },
        orderBy: [{ maxAmount: 'desc' }, { createdAt: 'asc' }],
      })
      const challenger = proxies.find((p) => p.userId !== lot.leaderUserId && p.maxAmount >= min)
      if (!challenger) return
      if (!(await this.mayBid(tx, lot, challenger.userId, now))) {
        await tx.autoBid.update({ where: { id: challenger.id }, data: { active: false } })
        continue
      }
      const leaderProxy = proxies.find((p) => p.userId === lot.leaderUserId)
      const leaderStronger =
        leaderProxy !== undefined &&
        (leaderProxy.maxAmount > challenger.maxAmount ||
          (leaderProxy.maxAmount === challenger.maxAmount && leaderProxy.createdAt < challenger.createdAt))

      if (!leaderStronger) {
        const target = leaderProxy ? leaderProxy.maxAmount + lot.step : min
        const amount = bigMin(challenger.maxAmount, bigMax(min, target))
        await this.insertBid(tx, lot, challenger.userId, amount, key(), now, true)
        continue
      }

      // Лидер сильнее: претендент поднимает цену, оставляя лидеру место ответить на шаг.
      const challengerBid = bigMin(challenger.maxAmount, leaderProxy!.maxAmount - lot.step)
      if (challengerBid < min) {
        await tx.autoBid.update({ where: { id: challenger.id }, data: { active: false } })
        continue
      }
      await this.insertBid(tx, lot, challenger.userId, challengerBid, key(), now, true)
      await this.insertBid(tx, lot, leaderProxy!.userId, challengerBid + lot.step, key(), now, true)
    }
  }

  // ───────────── общие части ─────────────

  private tx<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(fn, {
      isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
      timeout: 10_000,
    })
  }

  private async lockLot(tx: Prisma.TransactionClient, lotId: string): Promise<LotState> {
    const [row] = await tx.$queryRaw<LockedLotRow[]>`
      SELECT id, status::text AS status, "startPrice" AS start_price, step, "currentPrice" AS current_price,
             "leaderUserId" AS leader_user_id, "lastSeq" AS last_seq, "opensAt" AS opens_at, "closesAt" AS closes_at
      FROM "Lot" WHERE id = ${lotId}::uuid FOR UPDATE`
    if (!row) throw new BidRejectedError('LOT_NOT_FOUND')
    return {
      id: row.id,
      status: row.status,
      startPrice: row.start_price,
      step: row.step,
      currentPrice: row.current_price,
      leaderUserId: row.leader_user_id,
      lastSeq: row.last_seq,
      opensAt: row.opens_at,
      closesAt: row.closes_at,
    }
  }

  private minOf(lot: Pick<LotState, 'startPrice' | 'step' | 'currentPrice'>): bigint {
    return minNextBid(lot.startPrice, lot.step, lot.currentPrice)
  }

  private assertOpen(lot: LotState, now: Date, min: bigint) {
    if (now >= lot.closesAt) throw new BidRejectedError('LOT_CLOSED', min)
    if (lot.status !== 'LIVE' || now < lot.opensAt) throw new BidRejectedError('LOT_NOT_LIVE', min)
  }

  private async assertMayBid(
    tx: Prisma.TransactionClient,
    lot: LotState,
    userId: string,
    now: Date,
    min: bigint,
    opts: { allowLeader?: boolean } = {}
  ) {
    const admission = await tx.admission.findUnique({
      where: { lotId_userId: { lotId: lot.id, userId } },
      select: { id: true },
    })
    if (!admission) throw new BidRejectedError('NO_ADMISSION', min)
    if (await this.isRestricted(tx, userId, now)) throw new BidRejectedError('RESTRICTED', min)
    if (!opts.allowLeader && lot.leaderUserId === userId) throw new BidRejectedError('ALREADY_LEADING', min)
  }

  private async mayBid(tx: Prisma.TransactionClient, lot: LotState, userId: string, now: Date): Promise<boolean> {
    const admission = await tx.admission.findUnique({
      where: { lotId_userId: { lotId: lot.id, userId } },
      select: { id: true },
    })
    return Boolean(admission) && !(await this.isRestricted(tx, userId, now))
  }

  private async isRestricted(tx: Prisma.TransactionClient, userId: string, now: Date) {
    const r = await tx.restriction.findFirst({
      where: { userId, liftedAt: null, startsAt: { lte: now }, endsAt: { gt: now } },
      select: { id: true },
    })
    return Boolean(r)
  }

  /** Запись принятого предложения: монотонный seq, обновление лота, событие в outbox. */
  private async insertBid(
    tx: Prisma.TransactionClient,
    lot: LotState,
    userId: string,
    amount: bigint,
    idempotencyKey: string,
    now: Date,
    auto: boolean
  ) {
    const min = this.minOf(lot)
    if (amount < min) throw new Error(`invariant: bid ${amount} below min ${min}`)
    const seq = lot.lastSeq + 1
    const bid = await tx.bid.create({
      data: { lotId: lot.id, userId, amount, seq, idempotencyKey, createdAt: now },
      select: { id: true, seq: true, amount: true, createdAt: true },
    })
    await tx.lot.update({ where: { id: lot.id }, data: { currentPrice: amount, lastSeq: seq, leaderUserId: userId } })
    lot.currentPrice = amount
    lot.lastSeq = seq
    lot.leaderUserId = userId

    const user = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { publicName: true } })
    await tx.outboxEvent.create({
      data: {
        type: 'bid.accepted',
        aggregateId: lot.id,
        payload: {
          lotId: lot.id,
          seq,
          amount: amount.toString(),
          publicName: user.publicName,
          auto,
          serverTime: now.toISOString(),
        },
      },
    })
    return bid
  }

  private async findReplay(userId: string, idempotencyKey: string, tx: Prisma.TransactionClient = this.prisma) {
    const bid = await tx.bid.findUnique({
      where: { userId_idempotencyKey: { userId, idempotencyKey } },
      include: { lot: { select: { currentPrice: true, startPrice: true, step: true } } },
    })
    if (!bid) return null
    const current = bid.lot.currentPrice ?? bid.amount
    return {
      bid: { id: bid.id, seq: bid.seq, amount: bid.amount, createdAt: bid.createdAt },
      currentPrice: current,
      minNextBid: minNextBid(bid.lot.startPrice, bid.lot.step, current),
      replayed: true,
    } satisfies BidResult
  }
}

const bigMin = (a: bigint, b: bigint) => (a < b ? a : b)
const bigMax = (a: bigint, b: bigint) => (a > b ? a : b)
