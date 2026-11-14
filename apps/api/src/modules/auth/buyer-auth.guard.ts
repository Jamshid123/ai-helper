import { type CanActivate, type ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import type { FastifyRequest } from 'fastify'
import { IS_PUBLIC } from '../../common/public.decorator'
import { STAFF_MODULE } from '../staff/staff.decorator'
import { SessionService } from './session.service'

export type AuthedRequest = FastifyRequest & { userId: string }

/** Глобальный guard покупателя: без валидной сессии — 401, кроме @Public() и эндпоинтов админки (@StaffOnly()). */
@Injectable()
export class BuyerAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly sessions: SessionService
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const targets = [ctx.getHandler(), ctx.getClass()]
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets)) return true
    // эндпоинты админки проверяет StaffAuthGuard (cookie-сессия сотрудника), а не токен покупателя
    if (this.reflector.getAllAndOverride<unknown>(STAFF_MODULE, targets) !== undefined) return true
    const req = ctx.switchToHttp().getRequest<AuthedRequest>()
    const header = req.headers.authorization ?? ''
    const token = header.startsWith('Bearer ') ? header.slice(7) : ''
    const userId = token ? await this.sessions.verify(token) : null
    if (!userId) throw new UnauthorizedException({ code: 'UNAUTHORIZED', message: 'Нужна авторизация' })
    req.userId = userId
    return true
  }
}
