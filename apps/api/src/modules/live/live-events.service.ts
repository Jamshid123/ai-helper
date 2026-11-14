import { Injectable, Logger, type OnApplicationBootstrap, type OnModuleDestroy } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'

/** Событие для комнаты: только публичные данные торгов (без участников). */
export type LiveEvent = { id: string; type: 'bid' | 'lot'; data: Record<string, unknown> }
type Listener = { send: (e: LiveEvent) => void; end: () => void }

const POLL_MS = 400
/**
 * Окно повторного просмотра: id outbox выдаётся при вставке, а коммит может прийти позже,
 * поэтому перечитываем хвост и отсекаем уже разосланное по id.
 */
const OVERLAP = 200n
const TYPES = ['bid.accepted', 'lot.opened', 'lot.closed', 'admission.granted']
export const MAX_STREAMS = 2_000

/**
 * Рассылка событий лота подписчикам комнаты (SSE). Источник — outbox-таблица: туда в той же транзакции
 * пишут предложения (в т.ч. автопредложения из планировщика), открытие/закрытие и допуски.
 * Один процесс API — подписчики в памяти. События — подсказка «обновись»; клиент перечитывает
 * состояние по HTTP, поэтому пропуск события не ломает правила, а переподключение = ресинк.
 */
@Injectable()
export class LiveEventsService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly log = new Logger(LiveEventsService.name)
  private readonly byLot = new Map<string, Set<Listener>>()
  /** id из окна перечитывания, которые уже разосланы (старше окна — не нужны: туда не смотрим). */
  private readonly seen = new Set<bigint>()
  private cursor: bigint | null = null
  private timer: NodeJS.Timeout | null = null
  private polling = false
  private streams = 0

  constructor(private readonly prisma: PrismaService) {}

  get openStreams(): number {
    return this.streams
  }

  async onApplicationBootstrap() {
    await this.poll() // запомнить хвост outbox до приёма запросов: события после старта не теряются
    this.timer = setInterval(() => void this.poll(), POLL_MS)
    this.timer.unref()
  }

  /** Закрываем открытые потоки, иначе HTTP-сервер не завершится. */
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer)
    for (const set of this.byLot.values()) for (const l of set) l.end()
    this.byLot.clear()
  }

  subscribe(lotId: string, send: Listener['send'], end: Listener['end']): () => void {
    const l: Listener = { send, end }
    let set = this.byLot.get(lotId)
    if (!set) this.byLot.set(lotId, (set = new Set()))
    set.add(l)
    this.streams++
    return () => {
      if (!set.delete(l)) return
      this.streams--
      if (set.size === 0) this.byLot.delete(lotId)
    }
  }

  async poll(): Promise<void> {
    if (this.polling) return
    this.polling = true
    try {
      if (this.cursor === null) {
        // Старт: всё, что уже есть в окне, считаем разосланным — историю не повторяем.
        const tail = await this.prisma.outboxEvent.findMany({
          orderBy: { id: 'desc' },
          take: Number(OVERLAP),
          select: { id: true },
        })
        this.cursor = tail[0]?.id ?? 0n
        for (const r of tail) this.seen.add(r.id)
        return
      }
      const rows = await this.prisma.outboxEvent.findMany({
        where: { id: { gt: this.cursor - OVERLAP }, type: { in: TYPES } },
        orderBy: { id: 'asc' },
        take: 500,
        select: { id: true, type: true, aggregateId: true, payload: true },
      })
      for (const r of rows) {
        if (r.id > this.cursor) this.cursor = r.id
        if (this.seen.has(r.id)) continue
        this.seen.add(r.id)
        const event = toLiveEvent(r.id, r.type, r.payload)
        const set = this.byLot.get(r.aggregateId)
        if (event && set) for (const l of set) l.send(event)
      }
      const floor = this.cursor - OVERLAP
      for (const id of this.seen) if (id <= floor) this.seen.delete(id)
    } catch (e) {
      this.log.error(e, 'live events poll failed')
    } finally {
      this.polling = false
    }
  }
}

function toLiveEvent(id: bigint, type: string, payload: unknown): LiveEvent | null {
  const p = (payload ?? {}) as Record<string, unknown>
  switch (type) {
    case 'bid.accepted':
      return { id: String(id), type: 'bid', data: { seq: p.seq, amount: p.amount, at: p.serverTime } }
    case 'lot.opened':
      return { id: String(id), type: 'lot', data: { change: 'opened' } }
    case 'lot.closed':
      return { id: String(id), type: 'lot', data: { change: 'closed' } }
    case 'admission.granted':
      return { id: String(id), type: 'lot', data: { change: 'admitted' } }
    default:
      return null
  }
}
