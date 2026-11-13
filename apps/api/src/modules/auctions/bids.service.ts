import { Injectable } from '@nestjs/common'
import { Prisma, type Bid } from '@prisma/client'
import { minNextBid } from '@auksion/shared'
import { Clock } from '../../common/clock'
import { PrismaService } from '../../prisma/prisma.service'
import { BidRejectedError } from './bid.errors'

type LockedLot = {
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

export type BidResult = {
  bid: Pick<Bid, 'id' | 'seq' | 'amount' | 'createdAt'>
  currentPrice: bigint
  minNextBid: bigint
  replayed: boolean
}

/**
 * Приём предложения цены (самое критичное место, ТЗ «Принятие ставки»).
 * Всё в одной транзакции: идемпотентность → блокировка строки лота (FOR UPDATE) → проверки по
 * актуальному состоянию → запись с монотонным seq → событие в outbox (публикует воркер, не транзакция).
 */
@Injectable()
export class BidsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock
  ) {}

  async placeBid(userId: string, lotId: string, amount: bigint, idempotencyKey: string): Promise<BidResult> {
    try {
      return await this.prisma.$transaction((tx) => this.placeInTx(tx, userId, lotId, amount, idempotencyKey), {
        isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
        timeout: 5_000,
      })
    } catch (e) {
      // Гонка двух запросов с одним ключом: второй упирается в уникальный индекс → возвращаем исходный результат.
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        const existing = await this.findReplay(userId, idempotencyKey)
        if (existing) return existing
      }
      throw e
    }
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

  private async placeInTx(
    tx: Prisma.TransactionClient,
    userId: string,
    lotId: string,
    amount: bigint,
    idempotencyKey: string
  ): Promise<BidResult> {
    // 1. Повтор того же запроса → исходный результат (даже если лот уже закрыт).
    const replay = await this.findReplay(userId, idempotencyKey, tx)
    if (replay) return replay

    // 2. Блокируем строку лота: конкурентные предложения ждут здесь и затем видят новую цену.
    const [lot] = await tx.$queryRaw<LockedLot[]>`
      SELECT id, status::text AS status, "startPrice" AS start_price, step, "currentPrice" AS current_price,
             "leaderUserId" AS leader_user_id, "lastSeq" AS last_seq, "opensAt" AS opens_at, "closesAt" AS closes_at
      FROM "Lot" WHERE id = ${lotId}::uuid FOR UPDATE`
    if (!lot) throw new BidRejectedError('LOT_NOT_FOUND')

    // 2a. Повторная проверка ключа уже под блокировкой: параллельный запрос с тем же ключом мог
    // закоммитить, пока мы ждали (READ COMMITTED видит его после получения блокировки).
    const replayAfterLock = await this.findReplay(userId, idempotencyKey, tx)
    if (replayAfterLock) return replayAfterLock

    const min = minNextBid(lot.start_price, lot.step, lot.current_price)
    const now = this.clock.now()

    // 3. Проверки по актуальному состоянию (под блокировкой).
    if (now >= lot.closes_at) throw new BidRejectedError('LOT_CLOSED', min)
    if (lot.status !== 'LIVE' || now < lot.opens_at) throw new BidRejectedError('LOT_NOT_LIVE', min)

    const admission = await tx.admission.findUnique({
      where: { lotId_userId: { lotId, userId } },
      select: { id: true },
    })
    if (!admission) throw new BidRejectedError('NO_ADMISSION', min)

    const restriction = await tx.restriction.findFirst({
      where: { userId, liftedAt: null, startsAt: { lte: now }, endsAt: { gt: now } },
      select: { id: true },
    })
    if (restriction) throw new BidRejectedError('RESTRICTED', min)

    if (lot.leader_user_id === userId) throw new BidRejectedError('ALREADY_LEADING', min)
    if (amount < min) throw new BidRejectedError('BID_TOO_LOW', min)

    // 4. Запись: монотонный seq, серверное время.
    const seq = lot.last_seq + 1
    const bid = await tx.bid.create({
      data: { lotId, userId, amount, seq, idempotencyKey, createdAt: now },
      select: { id: true, seq: true, amount: true, createdAt: true },
    })
    await tx.lot.update({ where: { id: lotId }, data: { currentPrice: amount, lastSeq: seq, leaderUserId: userId } })

    const user = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { publicName: true } })
    await tx.outboxEvent.create({
      data: {
        type: 'bid.accepted',
        aggregateId: lotId,
        payload: { lotId, seq, amount: amount.toString(), publicName: user.publicName, serverTime: now.toISOString() },
      },
    })

    return { bid, currentPrice: amount, minNextBid: minNextBid(lot.start_price, lot.step, amount), replayed: false }
  }
}
