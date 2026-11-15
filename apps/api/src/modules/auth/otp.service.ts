import { createHmac, randomInt, timingSafeEqual } from 'node:crypto'
import { HttpException, HttpStatus, Inject, Injectable, ServiceUnavailableException } from '@nestjs/common'
import { Clock } from '../../common/clock'
import { ENV } from '../../config/config.module'
import type { Env } from '../../config/env'
import { PrismaService } from '../../prisma/prisma.service'
import { SmsProvider } from '../sms/sms.provider'

/** Правила SMS-кода входа (решение 15.11.2026). */
export const OTP = {
  TTL_SEC: 300,
  MAX_ATTEMPTS: 5,
  RESEND_SEC: 60,
  PER_PHONE_HOUR: 5,
  PER_IP_HOUR: 20,
} as const

const fail = (status: number, code: string, message: string, extra: object = {}) =>
  new HttpException({ code, message, ...extra }, status)

@Injectable()
export class OtpService {
  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly prisma: PrismaService,
    private readonly sms: SmsProvider,
    private readonly clock: Clock
  ) {}

  /** HMAC кода: в БД сам код не хранится. */
  private hash(phone: string, code: string): string {
    return createHmac('sha256', this.env.JWT_SECRET).update(`otp:${phone}:${code}`).digest('hex')
  }

  async request(phone: string, ip: string | null): Promise<{ retryAfterSec: number; devCode?: string }> {
    if (!this.sms.enabled)
      throw new ServiceUnavailableException({ code: 'SMS_DISABLED', message: 'Вход по SMS временно недоступен' })
    const now = this.clock.now()
    const hourAgo = new Date(now.getTime() - 3_600_000)
    const last = await this.prisma.otpChallenge.findFirst({ where: { phone }, orderBy: { createdAt: 'desc' } })
    if (last) {
      const wait = Math.ceil((last.createdAt.getTime() + OTP.RESEND_SEC * 1000 - now.getTime()) / 1000)
      if (wait > 0)
        throw fail(HttpStatus.TOO_MANY_REQUESTS, 'OTP_COOLDOWN', 'Новый код можно запросить чуть позже', {
          retryAfterSec: wait,
        })
    }
    const [byPhone, byIp] = await Promise.all([
      this.prisma.otpChallenge.count({ where: { phone, createdAt: { gt: hourAgo } } }),
      ip ? this.prisma.otpChallenge.count({ where: { ip, createdAt: { gt: hourAgo } } }) : Promise.resolve(0),
    ])
    if (byPhone >= OTP.PER_PHONE_HOUR || byIp >= OTP.PER_IP_HOUR) {
      throw fail(HttpStatus.TOO_MANY_REQUESTS, 'OTP_LIMIT', 'Слишком много запросов кода. Попробуйте через час')
    }
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0')
    await this.prisma.otpChallenge.create({
      data: { phone, codeHash: this.hash(phone, code), ip, expiresAt: new Date(now.getTime() + OTP.TTL_SEC * 1000) },
    })
    await this.sms.send(phone, `AuksionGO: kod ${code}. Hech kimga bermang / Никому не сообщайте.`)
    return { retryAfterSec: OTP.RESEND_SEC, ...(this.sms.exposesCodes && { devCode: code }) }
  }

  /** Действует только последний запрошенный код; верный — гасится. Неверный — считает попытку. */
  async verify(phone: string, code: string): Promise<void> {
    const now = this.clock.now()
    const ch = await this.prisma.otpChallenge.findFirst({ where: { phone }, orderBy: { createdAt: 'desc' } })
    if (!ch || ch.consumedAt || ch.expiresAt <= now)
      throw fail(HttpStatus.BAD_REQUEST, 'OTP_EXPIRED', 'Код устарел — запросите новый')
    if (ch.attempts >= OTP.MAX_ATTEMPTS)
      throw fail(HttpStatus.TOO_MANY_REQUESTS, 'OTP_LOCKED', 'Слишком много попыток — запросите новый код')
    const ok = timingSafeEqual(Buffer.from(this.hash(phone, code)), Buffer.from(ch.codeHash))
    if (!ok) {
      // атомарно: параллельные неверные попытки не обойдут лимит
      const r = await this.prisma.otpChallenge.updateMany({
        where: { id: ch.id, attempts: { lt: OTP.MAX_ATTEMPTS } },
        data: { attempts: { increment: 1 } },
      })
      const left = Math.max(0, OTP.MAX_ATTEMPTS - ch.attempts - r.count)
      throw fail(HttpStatus.BAD_REQUEST, 'OTP_INVALID', 'Неверный код', { attemptsLeft: left })
    }
    const consumed = await this.prisma.otpChallenge.updateMany({
      where: { id: ch.id, consumedAt: null },
      data: { consumedAt: now },
    })
    if (consumed.count === 0) throw fail(HttpStatus.BAD_REQUEST, 'OTP_EXPIRED', 'Код устарел — запросите новый')
  }
}
