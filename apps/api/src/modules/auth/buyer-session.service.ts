import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { ForbiddenException, Injectable } from '@nestjs/common'
import { Clock } from '../../common/clock'
import { PrismaService } from '../../prisma/prisma.service'

/** Сессия покупателя на сайте (решение 15.11.2026): httpOnly-cookie на 30 дней, CSRF — double submit. */
export const BUYER_SESSION_COOKIE = 'buyer_session'
export const BUYER_CSRF_COOKIE = 'buyer_csrf'
export const BUYER_SESSION_TTL_S = 30 * 24 * 3600

/**
 * Метка устройства (решение 15.11.2026): случайное значение в httpOnly-cookie на год.
 * С одного устройства — не больше 3 разных номеров за 30 дней; два аккаунта с одного устройства
 * не получают допуск в один лот. Это сигнал, а не доказательство: очистка cookie его сбрасывает.
 */
export const BUYER_DEVICE_COOKIE = 'buyer_device'
export const DEVICE = { COOKIE_TTL_S: 365 * 24 * 3600, MAX_ACCOUNTS: 3, WINDOW_DAYS: 30 } as const
const DEVICE_ID_RE = /^[A-Za-z0-9_-]{32}$/

/** Метка из cookie или новая (тогда её надо записать в ответ). */
export function deviceFromCookie(raw: string | undefined): { id: string; fresh: boolean } {
  return raw && DEVICE_ID_RE.test(raw)
    ? { id: raw, fresh: false }
    : { id: randomBytes(24).toString('base64url'), fresh: true }
}
export const deviceHashOf = (id: string) => sha256(`device:${id}`)

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex')
export const sameToken = (a: string, b: string) => {
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}

@Injectable()
export class BuyerSessionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock
  ) {}

  /** Кто входил с этого устройства за последние 30 дней. */
  async usersOnDevice(deviceHash: string): Promise<string[]> {
    const since = new Date(this.clock.now().getTime() - DEVICE.WINDOW_DAYS * 86_400_000)
    const rows = await this.prisma.buyerSession.findMany({
      where: { deviceHash, createdAt: { gte: since } },
      select: { userId: true },
      distinct: ['userId'],
    })
    return rows.map((r) => r.userId)
  }

  /** Новый номер на устройстве, где за 30 дней уже входили под 3 другими, — отказ (до отправки SMS). */
  async assertDeviceAllows(deviceHash: string, phone: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { phone }, select: { id: true } })
    const seen = await this.usersOnDevice(deviceHash)
    if (user && seen.includes(user.id)) return
    if (seen.length >= DEVICE.MAX_ACCOUNTS) {
      throw new ForbiddenException({
        code: 'DEVICE_LIMIT',
        message:
          'С этого устройства уже входили под несколькими номерами. Войдите под своим номером или напишите в поддержку',
      })
    }
  }

  async issue(userId: string, ip: string | null, deviceHash: string | null = null) {
    const token = randomBytes(32).toString('base64url')
    const csrfToken = randomBytes(24).toString('base64url')
    await this.prisma.buyerSession.create({
      data: {
        tokenHash: sha256(token),
        userId,
        csrfToken,
        ip,
        deviceHash,
        expiresAt: new Date(this.clock.now().getTime() + BUYER_SESSION_TTL_S * 1000),
      },
    })
    return { token, csrfToken }
  }

  async authenticate(
    token: string | undefined
  ): Promise<{ userId: string; csrfToken: string; deviceHash: string | null } | null> {
    if (!token) return null
    const s = await this.prisma.buyerSession.findUnique({ where: { tokenHash: sha256(token) } })
    if (!s || s.revokedAt || s.expiresAt <= this.clock.now()) return null
    return { userId: s.userId, csrfToken: s.csrfToken, deviceHash: s.deviceHash }
  }

  async revoke(token: string | undefined): Promise<void> {
    if (!token) return
    await this.prisma.buyerSession.updateMany({
      where: { tokenHash: sha256(token), revokedAt: null },
      data: { revokedAt: this.clock.now() },
    })
  }
}
