import { type CanActivate, type ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import type { FastifyRequest } from 'fastify'
import { IS_PUBLIC } from '../../common/public.decorator'
import { SessionService } from './session.service'

export type AuthedRequest = FastifyRequest & { userId: string }

/** Глобальный guard: без валидной сессии — 401, кроме эндпоинтов с @Public(). */
@Injectable()
export class BuyerAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly sessions: SessionService
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [ctx.getHandler(), ctx.getClass()])
    if (isPublic) return true
    const req = ctx.switchToHttp().getRequest<AuthedRequest>()
    const header = req.headers.authorization ?? ''
    const token = header.startsWith('Bearer ') ? header.slice(7) : ''
    const userId = token ? await this.sessions.verify(token) : null
    if (!userId) throw new UnauthorizedException({ code: 'UNAUTHORIZED', message: 'Нужна авторизация' })
    req.userId = userId
    return true
  }
}
