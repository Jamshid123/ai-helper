import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { Injectable } from '@nestjs/common'
import { Clock } from '../../common/clock'
import { PrismaService } from '../../prisma/prisma.service'

/** Сессия покупателя на сайте (решение 15.11.2026): httpOnly-cookie на 30 дней, CSRF — double submit. */
export const BUYER_SESSION_COOKIE = 'buyer_session'
export const BUYER_CSRF_COOKIE = 'buyer_csrf'
export const BUYER_SESSION_TTL_S = 30 * 24 * 3600

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

  async issue(userId: string, ip: string | null) {
    const token = randomBytes(32).toString('base64url')
    const csrfToken = randomBytes(24).toString('base64url')
    await this.prisma.buyerSession.create({
      data: {
        tokenHash: sha256(token),
        userId,
        csrfToken,
        ip,
        expiresAt: new Date(this.clock.now().getTime() + BUYER_SESSION_TTL_S * 1000),
      },
    })
    return { token, csrfToken }
  }

  async authenticate(token: string | undefined): Promise<{ userId: string; csrfToken: string } | null> {
    if (!token) return null
    const s = await this.prisma.buyerSession.findUnique({ where: { tokenHash: sha256(token) } })
    if (!s || s.revokedAt || s.expiresAt <= this.clock.now()) return null
    return { userId: s.userId, csrfToken: s.csrfToken }
  }

  async revoke(token: string | undefined): Promise<void> {
    if (!token) return
    await this.prisma.buyerSession.updateMany({
      where: { tokenHash: sha256(token), revokedAt: null },
      data: { revokedAt: this.clock.now() },
    })
  }
}
