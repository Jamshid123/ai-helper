import {
  type CallHandler,
  type ExecutionContext,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  type NestInterceptor,
  SetMetadata,
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import type { FastifyReply, FastifyRequest } from 'fastify'
import Redis from 'ioredis'
import type { Observable } from 'rxjs'
import { ENV } from '../config/config.module'
import type { Env } from '../config/env'
import { REDIS } from './redis.module'

/**
 * Ограничение частоты запросов к критичным эндпоинтам (решение заказчика 15.11.2026, Anti-Fraud Lite п. 3.6).
 * Фиксированное окно в Redis: ключ «правило + покупатель/IP + номер окна». Лимиты подобраны с запасом
 * для честного участника; уточнить после первых реальных торгов.
 * by: 'user' — по покупателю (без входа — по IP); 'ip' — по адресу клиента (мобильные операторы
 * дают один IP многим людям, поэтому лимиты по IP — только на вход и подключение к ленте).
 */
export type RateRule = { name: string; limit: number; windowSec: number; by: 'user' | 'ip' }

export const LIMITS = {
  otpRequest: { name: 'otp-request', limit: 10, windowSec: 60, by: 'ip' },
  otpVerify: { name: 'otp-verify', limit: 20, windowSec: 60, by: 'ip' },
  staffLogin: { name: 'staff-login', limit: 20, windowSec: 60, by: 'ip' },
  bid: { name: 'bid', limit: 20, windowSec: 10, by: 'user' },
  autobid: { name: 'autobid', limit: 20, windowSec: 60, by: 'user' },
  admission: { name: 'admission', limit: 20, windowSec: 60, by: 'user' },
  payment: { name: 'payment', limit: 20, windowSec: 60, by: 'user' },
  liveConnect: { name: 'live', limit: 60, windowSec: 60, by: 'ip' },
} as const satisfies Record<string, RateRule>

const RATE_RULE = Symbol('RATE_RULE')
export const RateLimit = (rule: RateRule) => SetMetadata(RATE_RULE, rule)

/**
 * Глобальный перехватчик: работает после guard'ов, поэтому покупатель уже известен.
 * Redis недоступен — запрос пропускаем (торги важнее), ошибку пишем в лог.
 */
@Injectable()
export class RateLimitInterceptor implements NestInterceptor {
  private readonly log = new Logger('RateLimit')

  constructor(
    private readonly reflector: Reflector,
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(ENV) private readonly env: Env
  ) {}

  async intercept(ctx: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    const rule = this.reflector.get<RateRule | undefined>(RATE_RULE, ctx.getHandler())
    if (!rule || !this.env.RATE_LIMIT_ENABLED) return next.handle()
    const req = ctx.switchToHttp().getRequest<FastifyRequest & { userId?: string }>()
    const subject = rule.by === 'user' && req.userId ? `u:${req.userId}` : `ip:${req.ip}`
    const nowSec = Math.floor(Date.now() / 1000)
    const window = Math.floor(nowSec / rule.windowSec)
    const key = `rl:${rule.name}:${subject}:${window}`
    let count: number
    try {
      const res = await this.redis.multi().incr(key).expire(key, rule.windowSec + 1).exec()
      count = Number(res?.[0]?.[1] ?? 0)
    } catch (e) {
      this.log.warn(`Redis недоступен, лимит «${rule.name}» не проверен: ${(e as Error).message}`)
      return next.handle()
    }
    if (count > rule.limit) {
      const retryAfterSec = (window + 1) * rule.windowSec - nowSec
      ctx.switchToHttp().getResponse<FastifyReply>().header('Retry-After', String(retryAfterSec))
      throw new HttpException(
        { code: 'RATE_LIMITED', message: 'Слишком много запросов. Подождите немного и повторите', retryAfterSec },
        HttpStatus.TOO_MANY_REQUESTS
      )
    }
    return next.handle()
  }
}
