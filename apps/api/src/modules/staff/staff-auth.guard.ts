import { timingSafeEqual } from 'node:crypto'
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
import { type AdminModule, allows } from './permissions'
import { STAFF_MODULE } from './staff.decorator'
import { type StaffPrincipal, StaffAuthService } from './staff-auth.service'

export type StaffRequest = FastifyRequest & { staff: StaffPrincipal }
export const SESSION_COOKIE = 'staff_session'
export const CSRF_COOKIE = 'csrf_token'
const SAFE = new Set(['GET', 'HEAD', 'OPTIONS'])

function sameToken(a: string, b: string): boolean {
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}

/**
 * Глобальный guard админки: действует только на эндпоинтах с @StaffOnly().
 * Сессия — httpOnly-cookie; мутации — CSRF (заголовок X-CSRF-Token = токен сессии); права — по модулю роли
 * (чтение — «просмотр», мутации — «изменение»); владелец проходит везде.
 */
@Injectable()
export class StaffAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly auth: StaffAuthService
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const targets = [ctx.getHandler(), ctx.getClass()]
    const module = this.reflector.getAllAndOverride<AdminModule | 'owner' | 'any' | undefined>(STAFF_MODULE, targets)
    if (module === undefined || this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets)) return true

    const req = ctx.switchToHttp().getRequest<StaffRequest>()
    const principal = await this.auth.authenticate(parseCookies(req.headers.cookie)[SESSION_COOKIE])
    if (!principal) throw new UnauthorizedException({ code: 'UNAUTHORIZED', message: 'Войдите в админку' })
    if (!SAFE.has(req.method)) {
      const header = req.headers['x-csrf-token']
      if (typeof header !== 'string' || !sameToken(header, principal.csrfToken)) {
        throw new ForbiddenException({ code: 'CSRF', message: 'Обновите страницу и повторите' })
      }
    }
    if (!principal.isOwner && module !== 'any') {
      const ok = module !== 'owner' && allows(principal.permissions, module, SAFE.has(req.method) ? 'view' : 'edit')
      if (!ok) throw new ForbiddenException({ code: 'FORBIDDEN', message: 'Недостаточно прав' })
    }
    req.staff = principal
    return true
  }
}
