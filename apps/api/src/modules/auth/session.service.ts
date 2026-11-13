import { Inject, Injectable } from '@nestjs/common'
import { jwtVerify, SignJWT } from 'jose'
import { Clock } from '../../common/clock'
import { ENV } from '../../config/config.module'
import type { Env } from '../../config/env'

/** Сессия покупателя: короткий JWT (1 ч). Mini App при истечении заново входит по свежему initData. */
export const BUYER_SESSION_TTL_SEC = 3600

@Injectable()
export class SessionService {
  private readonly key: Uint8Array

  constructor(
    @Inject(ENV) env: Env,
    private readonly clock: Clock
  ) {
    this.key = new TextEncoder().encode(env.JWT_SECRET)
  }

  async issue(userId: string): Promise<{ token: string; expiresAt: Date }> {
    const now = Math.floor(this.clock.now().getTime() / 1000)
    const exp = now + BUYER_SESSION_TTL_SEC
    const token = await new SignJWT({ typ: 'buyer' })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(userId)
      .setIssuedAt(now)
      .setExpirationTime(exp)
      .setAudience('auksion-miniapp')
      .sign(this.key)
    return { token, expiresAt: new Date(exp * 1000) }
  }

  /** Возвращает userId или null (просрочен, подделан, чужая аудитория). */
  async verify(token: string): Promise<string | null> {
    try {
      const { payload } = await jwtVerify(token, this.key, {
        algorithms: ['HS256'],
        audience: 'auksion-miniapp',
        currentDate: this.clock.now(),
      })
      return payload.typ === 'buyer' && typeof payload.sub === 'string' ? payload.sub : null
    } catch {
      return null
    }
  }
}
