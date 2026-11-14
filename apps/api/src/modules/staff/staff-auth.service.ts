import { createHash, randomBytes } from 'node:crypto'
import { HttpException, HttpStatus, Injectable, UnauthorizedException } from '@nestjs/common'
import { hash, verify } from '@node-rs/argon2'
import type { Staff, StaffRole } from '@prisma/client'
import { Clock } from '../../common/clock'
import { PrismaService } from '../../prisma/prisma.service'
import { AuditService } from './audit.service'

export const SESSION_TTL_S = 8 * 3600
const MAX_FAILS = 5
const LOCK_MS = 15 * 60_000
const MIN_PASSWORD = 12

export type StaffUser = { id: string; name: string; email: string; roles: StaffRole[] }
export type StaffPrincipal = { id: string; roles: StaffRole[]; sessionId: string; csrfToken: string }

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex')
const toUser = (s: Staff): StaffUser => ({ id: s.id, name: s.name, email: s.email, roles: s.roles })

@Injectable()
export class StaffAuthService {
  private dummyHash: Promise<string> | null = null

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly clock: Clock
  ) {}

  /** Создание сотрудника (CLI create-admin, позже — раздел «Сотрудники»). */
  async createStaff(input: { email: string; name: string; password: string; roles: StaffRole[] }): Promise<StaffUser> {
    if (input.password.length < MIN_PASSWORD) throw new Error(`Пароль — не короче ${MIN_PASSWORD} символов`)
    if (!input.roles.length) throw new Error('Нужна хотя бы одна роль')
    const staff = await this.prisma.staff.create({
      data: {
        email: input.email.trim().toLowerCase(),
        name: input.name.trim(),
        passwordHash: await hash(input.password),
        roles: input.roles,
      },
    })
    await this.audit.log({ actorType: 'system', action: 'staff.created', entityType: 'staff', entityId: staff.id })
    return toUser(staff)
  }

  /**
   * Вход по email и паролю (решение заказчика 14.11.2026: без второго фактора) → сессия.
   * Ответ одинаковый для неизвестного email и неверного пароля.
   */
  async login(email: string, password: string, ip: string | null) {
    const staff = await this.prisma.staff.findUnique({ where: { email: email.trim().toLowerCase() } })
    if (!staff || staff.disabledAt) {
      await verify(await this.dummy(), password).catch(() => false)
      throw this.invalid('INVALID_CREDENTIALS', 'Неверный email или пароль')
    }
    this.assertNotLocked(staff)
    if (!(await verify(staff.passwordHash, password))) {
      await this.fail(staff)
      throw this.invalid('INVALID_CREDENTIALS', 'Неверный email или пароль')
    }

    const token = randomBytes(32).toString('base64url')
    const csrfToken = randomBytes(24).toString('base64url')
    const now = this.clock.now()
    const updated = await this.prisma.$transaction(async (tx) => {
      const s = await tx.staff.update({ where: { id: staff.id }, data: { failedLogins: 0, lockedUntil: null } })
      await tx.staffSession.create({
        data: {
          tokenHash: sha256(token),
          staffId: staff.id,
          csrfToken,
          ip,
          expiresAt: new Date(now.getTime() + SESSION_TTL_S * 1000),
        },
      })
      await this.audit.log(
        { actorType: 'staff', actorId: staff.id, action: 'staff.login', entityType: 'staff', entityId: staff.id, ip },
        tx
      )
      return s
    })
    return { token, csrfToken, user: toUser(updated) }
  }

  /** Проверка cookie-сессии (guard). */
  async authenticate(token: string | undefined): Promise<StaffPrincipal | null> {
    if (!token) return null
    const s = await this.prisma.staffSession.findUnique({
      where: { tokenHash: sha256(token) },
      include: { staff: true },
    })
    if (!s || s.revokedAt || s.expiresAt <= this.clock.now() || s.staff.disabledAt) return null
    return { id: s.staffId, roles: s.staff.roles, sessionId: s.id, csrfToken: s.csrfToken }
  }

  async me(staffId: string): Promise<StaffUser> {
    return toUser(await this.prisma.staff.findUniqueOrThrow({ where: { id: staffId } }))
  }

  async logout(p: StaffPrincipal, ip: string | null): Promise<void> {
    await this.prisma.staffSession.update({ where: { id: p.sessionId }, data: { revokedAt: this.clock.now() } })
    await this.audit.log({
      actorType: 'staff',
      actorId: p.id,
      action: 'staff.logout',
      entityType: 'staff',
      entityId: p.id,
      ip,
    })
  }

  private assertNotLocked(staff: Staff) {
    if (staff.lockedUntil && staff.lockedUntil > this.clock.now()) {
      throw new HttpException(
        { code: 'LOCKED', message: 'Слишком много попыток. Попробуйте позже', until: staff.lockedUntil.toISOString() },
        HttpStatus.LOCKED
      )
    }
  }

  private async fail(staff: Staff) {
    const fails = staff.failedLogins + 1
    const lock = fails >= MAX_FAILS
    await this.prisma.staff.update({
      where: { id: staff.id },
      data: {
        failedLogins: lock ? 0 : fails,
        lockedUntil: lock ? new Date(this.clock.now().getTime() + LOCK_MS) : staff.lockedUntil,
      },
    })
    if (lock) {
      await this.audit.log({ actorType: 'system', action: 'staff.locked', entityType: 'staff', entityId: staff.id })
    }
  }

  private invalid(code: string, message: string) {
    return new UnauthorizedException({ code, message })
  }

  private dummy(): Promise<string> {
    this.dummyHash ??= hash(randomBytes(16).toString('hex'))
    return this.dummyHash
  }
}
