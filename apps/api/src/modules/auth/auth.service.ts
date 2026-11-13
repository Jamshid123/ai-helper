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
