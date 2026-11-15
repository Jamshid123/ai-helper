import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import type { FastifyRequest } from 'fastify'
import { parseCookies } from '../../common/cookies'
import { IS_PUBLIC } from '../../common/public.decorator'
import { STAFF_MODULE } from '../staff/staff.decorator'
import { BUYER_SESSION_COOKIE, BuyerSessionService, sameToken } from './buyer-session.service'
import { SessionService } from './session.service'

/** deviceHash — метка устройства сессии сайта (у входа через Telegram её нет). */
export type AuthedRequest = FastifyRequest & { userId: string; deviceHash?: string | null }

/** Глобальный guard покупателя: без валидной сессии — 401, кроме @Public() и эндпоинтов админки (@StaffOnly()). */
@Injectable()
export class BuyerAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly sessions: SessionService,
    private readonly web: BuyerSessionService
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const targets = [ctx.getHandler(), ctx.getClass()]
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets)) return true
    // эндпоинты админки проверяет StaffAuthGuard (cookie-сессия сотрудника), а не токен покупателя
    if (this.reflector.getAllAndOverride<unknown>(STAFF_MODULE, targets) !== undefined) return true
    const req = ctx.switchToHttp().getRequest<AuthedRequest>()
    // сайт: httpOnly-cookie; изменения — только с CSRF-заголовком (double submit)
    const web = await this.web.authenticate(parseCookies(req.headers.cookie)[BUYER_SESSION_COOKIE])
    if (web) {
      if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
        const csrf = req.headers['x-csrf-token']
        if (typeof csrf !== 'string' || !sameToken(csrf, web.csrfToken)) {
          throw new ForbiddenException({ code: 'CSRF', message: 'Обновите страницу и повторите' })
        }
      }
      req.userId = web.userId
      req.deviceHash = web.deviceHash
      return true
    }
    // Mini App (переходный период): Bearer JWT после входа по initData
    const header = req.headers.authorization ?? ''
    const token = header.startsWith('Bearer ') ? header.slice(7) : ''
    const userId = token ? await this.sessions.verify(token) : null
    if (!userId) throw new UnauthorizedException({ code: 'UNAUTHORIZED', message: 'Нужна авторизация' })
    req.userId = userId
    return true
  }
}
