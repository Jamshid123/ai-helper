import { Inject, Injectable, Logger, type OnApplicationBootstrap, type OnModuleDestroy } from '@nestjs/common'
import { ENV } from '../../config/config.module'
import type { Env } from '../../config/env'
import { PrismaService } from '../../prisma/prisma.service'
import { RemindersService } from '../reminders/reminders.service'
import { BidsService } from './bids.service'
import { LotLifecycleService } from './lot-lifecycle.service'

/** Ключ advisory-блокировки: один sweep на кластер, даже если процессов API несколько. */
const SWEEP_LOCK_KEY = 72_911_001

/**
 * Догоняющий sweep каждые N секунд: открывает и закрывает лоты по расписанию.
 * Проще и надёжнее отложенных задач: после перезапуска сам «догоняет» пропущенное.
 * Точность закрытия не влияет на правила — предложения после 18:00 отклоняет BidsService по времени.
 */
@Injectable()
export class LifecycleScheduler implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly log = new Logger(LifecycleScheduler.name)
  private timer: NodeJS.Timeout | null = null
  private running = false

  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly prisma: PrismaService,
    private readonly lifecycle: LotLifecycleService,
    private readonly bids: BidsService,
    private readonly reminders: RemindersService
  ) {}

  onApplicationBootstrap() {
    if (!this.env.SCHEDULER_ENABLED) return
    this.timer = setInterval(() => void this.tick(), this.env.SCHEDULER_INTERVAL_MS)
    this.timer.unref()
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer)
  }

  async tick(): Promise<void> {
    if (this.running) return
    this.running = true
    try {
      const [{ locked }] = await this.prisma.$queryRaw<
        { locked: boolean }[]
      >`SELECT pg_try_advisory_lock(${SWEEP_LOCK_KEY}) AS locked`
      if (!locked) return
      try {
        const opened = await this.lifecycle.openDue()
        // Максимумы, заданные до открытия, начинают работать сразу в 09:00.
        for (const lotId of opened) await this.bids.runProxies(lotId)
        const closed = await this.lifecycle.closeDue()
        await this.reminders.dispatchDue()
        if (opened.length || Object.keys(closed).length) this.log.log({ opened, closed }, 'lifecycle sweep')
      } finally {
        await this.prisma.$queryRaw`SELECT pg_advisory_unlock(${SWEEP_LOCK_KEY})`
      }
    } catch (e) {
      this.log.error(e, 'lifecycle sweep failed')
    } finally {
      this.running = false
    }
  }
}
