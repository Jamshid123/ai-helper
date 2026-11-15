import { randomInt } from 'node:crypto'
import { Inject, Injectable, UnauthorizedException } from '@nestjs/common'
import { Clock } from '../../common/clock'
import { ENV } from '../../config/config.module'
import type { Env } from '../../config/env'
import { PrismaService } from '../../prisma/prisma.service'
import { SessionService } from './session.service'
import { InitDataError, validateInitData, type TelegramUser } from './telegram-init-data'

/** «Азиз К.» или «Участник 0417» — публичное имя для ленты торгов (ТЗ «Экран торгов»). */
export function publicNameFor(u: Pick<TelegramUser, 'id' | 'first_name' | 'last_name'>): string {
  const last = u.last_name?.trim()
  if (last) return `${u.first_name.trim()} ${last[0].toUpperCase()}.`
  return `Участник ${String(u.id).slice(-4).padStart(4, '0')}`
}

@Injectable()
export class AuthService {
  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly prisma: PrismaService,
    private readonly sessions: SessionService,
    private readonly clock: Clock
  ) {}

  async loginWithTelegram(initData: string) {
    let tg: TelegramUser
    try {
      tg = validateInitData(initData, this.env.TELEGRAM_BOT_TOKEN, this.clock.now()).user
    } catch (e) {
      if (e instanceof InitDataError) {
        throw new UnauthorizedException({
          code: 'INVALID_INIT_DATA',
          message: 'Откройте приложение заново из Telegram',
        })
      }
      throw e
    }
    const profile = { firstName: tg.first_name, lastName: tg.last_name ?? null, username: tg.username ?? null }
    const user = await this.prisma.user.upsert({
      where: { telegramId: BigInt(tg.id) },
      create: { telegramId: BigInt(tg.id), ...profile, publicName: publicNameFor(tg) },
      update: { ...profile, publicName: publicNameFor(tg) },
    })
    const session = await this.sessions.issue(user.id)
    return { token: session.token, expiresAt: session.expiresAt.toISOString(), user: toBuyerDto(user) }
  }

  /** Вход на сайте по подтверждённому телефону: новый покупатель создаётся без имени (его спросит экран профиля). */
  async loginWithPhone(phone: string) {
    const now = this.clock.now()
    const user = await this.prisma.user.upsert({
      where: { phone },
      create: {
        phone,
        phoneVerifiedAt: now,
        firstName: '',
        publicName: `Участник ${String(randomInt(0, 10_000)).padStart(4, '0')}`,
      },
      update: { phoneVerifiedAt: now },
    })
    return { user: toBuyerDto(user), needsProfile: !user.firstName }
  }

  /** Имя для профиля и публичное «Имя Ф.» для ленты торгов. */
  async updateProfile(userId: string, firstName: string, lastName: string | null) {
    const last = lastName?.trim() || null
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        firstName: firstName.trim(),
        lastName: last,
        ...(last && { publicName: `${firstName.trim()} ${last[0].toUpperCase()}.` }),
      },
    })
    return toBuyerDto(user)
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } })
    if (!user) throw new UnauthorizedException({ code: 'UNAUTHORIZED', message: 'Нужна авторизация' })
    return toBuyerDto(user)
  }
}

/** Что покупатель видит о себе. Телефон и telegramId наружу не отдаём. */
function toBuyerDto(u: {
  id: string
  firstName: string
  publicName: string
  phoneVerifiedAt: Date | null
  rulesAcceptedAt: Date | null
}) {
  return {
    id: u.id,
    firstName: u.firstName,
    publicName: u.publicName,
    phoneVerified: Boolean(u.phoneVerifiedAt),
    rulesAccepted: Boolean(u.rulesAcceptedAt),
  }
}
