import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common'
import type { Prisma } from '@prisma/client'
import { Clock } from '../../common/clock'
import { ENV } from '../../config/config.module'
import type { Env } from '../../config/env'
import { PrismaService } from '../../prisma/prisma.service'
import { SmsProvider } from '../sms/sms.provider'

export type NotificationType = 'relist_invite' | 'relist_reminder' | 'relist_released' | 'relist_cancelled'
type Row = { userId: string; type: NotificationType; lotId: string }

/** Какие уведомления дублируем SMS (решение 16.11.2026, вариант C): приглашение, напоминание, отмена. */
const SMS_TYPES: NotificationType[] = ['relist_invite', 'relist_reminder', 'relist_cancelled']
/** Старые неотправленные SMS не досылаем (например, провайдер подключили позже). */
const SMS_MAX_AGE_MS = 12 * 3_600_000

/**
 * Уведомления покупателю: сначала на сайте (баннер), SMS — через `SmsProvider`, когда он подключён.
 * Одно уведомление на (покупатель, тип, лот) — повторная публикация или sweep дублей не создают.
 * Тексты без причины несостоявшейся сделки и без имён (решение 16.11.2026); анти-фишинговая фраза в SMS.
 */
@Injectable()
export class NotificationsService {
  private readonly log = new Logger(NotificationsService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
    private readonly sms: SmsProvider,
    @Inject(ENV) private readonly env: Env
  ) {}

  async create(tx: Prisma.TransactionClient, rows: Row[]): Promise<number> {
    if (!rows.length) return 0
    const createdAt = this.clock.now() // время приложения (в тестах — подменённое), а не часы БД
    const r = await tx.notification.createMany({ data: rows.map((x) => ({ ...x, createdAt })), skipDuplicates: true })
    return r.count
  }

  async mine(userId: string) {
    const list = await this.prisma.notification.findMany({
      where: { userId, readAt: null },
      orderBy: { createdAt: 'desc' },
      take: 20,
    })
    if (!list.length) return []
    const lots = await this.prisma.lot.findMany({
      where: { id: { in: list.map((n) => n.lotId) } },
      select: { id: true, title: true, opensAt: true, status: true },
    })
    return list.map((n) => {
      const lot = lots.find((l) => l.id === n.lotId)
      return {
        id: n.id,
        type: n.type,
        lotId: n.lotId,
        lotTitle: lot?.title ?? '',
        opensAt: lot?.opensAt.toISOString() ?? null,
        createdAt: n.createdAt.toISOString(),
      }
    })
  }

  async markRead(userId: string, id: string) {
    const r = await this.prisma.notification.updateMany({
      where: { id, userId, readAt: null },
      data: { readAt: this.clock.now() },
    })
    if (!r.count) {
      const exists = await this.prisma.notification.count({ where: { id, userId } })
      if (!exists) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Уведомление не найдено' })
    }
    return { ok: true }
  }

  /** SMS по ещё не отправленным уведомлениям (sweep расписания). Без провайдера — ничего не делает. */
  async dispatchSms(): Promise<number> {
    if (!this.sms.enabled) return 0
    const now = this.clock.now()
    const due = await this.prisma.notification.findMany({
      where: {
        smsSentAt: null,
        type: { in: SMS_TYPES },
        createdAt: { gt: new Date(now.getTime() - SMS_MAX_AGE_MS) },
      },
      take: 100,
      orderBy: { createdAt: 'asc' },
    })
    let sent = 0
    for (const n of due) {
      // «захват» строки: при двух процессах SMS уйдёт один раз
      const claimed = await this.prisma.notification.updateMany({
        where: { id: n.id, smsSentAt: null },
        data: { smsSentAt: now },
      })
      if (!claimed.count) continue
      const [user, lot] = await Promise.all([
        this.prisma.user.findUnique({ where: { id: n.userId }, select: { phone: true } }),
        this.prisma.lot.findUnique({ where: { id: n.lotId }, select: { title: true, opensAt: true } }),
      ])
      if (!user?.phone || !lot) continue
      try {
        await this.sms.send(user.phone, smsText(n.type as NotificationType, lot.title, lot.opensAt, this.siteHost()))
        sent++
      } catch (e) {
        this.log.warn(`SMS не отправлено (***${user.phone.slice(-2)}): ${(e as Error).message}`)
      }
    }
    return sent
  }

  private siteHost(): string {
    const origin = this.env.CORS_ORIGINS[0] ?? ''
    try {
      return new URL(origin).host
    } catch {
      return origin
    }
  }
}

/** Дата и время начала по Ташкенту: «18.11 в 20:00» / «18.11 soat 20:00». */
function when(d: Date, locale: 'ru' | 'uz'): string {
  const parts = new Intl.DateTimeFormat('ru-RU', {
    timeZone: 'Asia/Tashkent',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(d)
  const v = (t: string) => parts.find((p) => p.type === t)?.value ?? ''
  return `${v('day')}.${v('month')} ${locale === 'ru' ? 'в' : 'soat'} ${v('hour')}:${v('minute')}`
}

/** Короткий текст SMS на двух языках. Без ссылок на оплату и без просьбы назвать код. */
export function smsText(type: NotificationType, title: string, opensAt: Date, host: string): string {
  const t = title.length > 40 ? `${title.slice(0, 39)}…` : title
  const safe = `SMSda to'lov yoki kod so'ramaymiz / Оплату и коды в SMS не просим`
  switch (type) {
    case 'relist_invite':
      return [
        `AuksionGO: "${t}" qayta savdoda ${when(opensAt, 'uz')}. Ruxsatingiz saqlangan, qayta to'lash shart emas. ${host} da tasdiqlang.`,
        `«${t}» снова на торгах ${when(opensAt, 'ru')}. Допуск сохранён, платить ещё раз не нужно. Подтвердите на ${host}.`,
        safe,
      ].join('\n')
    case 'relist_reminder':
      return [
        `AuksionGO: "${t}" ${when(opensAt, 'uz')}. Ishtirokni ${host} da tasdiqlang, aks holda joy bo'shatiladi.`,
        `Подтвердите участие на ${host}, иначе место освободится.`,
        safe,
      ].join('\n')
    case 'relist_cancelled':
      return [
        `AuksionGO: "${t}" savdosi bekor qilindi — ishtirokchilar yetarli emas.`,
        `Торги «${t}» отменены: не набралось участников.`,
      ].join('\n')
    default:
      return ''
  }
}
