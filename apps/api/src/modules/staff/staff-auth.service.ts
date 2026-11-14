import { createHash, randomBytes } from 'node:crypto'
import { ConflictException, HttpException, HttpStatus, Injectable, UnauthorizedException } from '@nestjs/common'
import { hash, verify } from '@node-rs/argon2'
import type { Role, Staff } from '@prisma/client'
import { Clock } from '../../common/clock'
import { normalizeUzPhone } from '../../common/phone'
import { PrismaService } from '../../prisma/prisma.service'
import { AuditService } from './audit.service'
import { ALL_EDIT, type Permissions, sanitizePermissions } from './permissions'

export const SESSION_TTL_S = 8 * 3600
const MAX_FAILS = 5
const LOCK_MS = 15 * 60_000
const MIN_PASSWORD = 12

export type StaffUser = {
  id: string
  name: string
  firstName: string
  lastName: string
  phone: string | null
  email: string | null
  isOwner: boolean
  role: { id: string; name: string } | null
  /** Итоговые права: у владельца — все модули на изменение. */
  permissions: Permissions
  disabled: boolean
}
export type StaffInput = {
  firstName: string
  lastName: string
  phone: string
  password: string
  roleId?: string
  isOwner?: boolean
}
export type StaffPrincipal = {
  id: string
  isOwner: boolean
  permissions: Permissions
  sessionId: string
  csrfToken: string
}
type StaffWithRole = Staff & { role: Role | null }

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex')
const permissionsOf = (s: StaffWithRole): Permissions =>
  s.isOwner ? ALL_EDIT : sanitizePermissions(s.role?.permissions)
const toUser = (s: StaffWithRole): StaffUser => ({
  id: s.id,
  name: `${s.firstName} ${s.lastName}`.trim(),
  firstName: s.firstName,
  lastName: s.lastName,
  phone: s.phone,
  email: s.email,
  isOwner: s.isOwner,
  role: s.role ? { id: s.role.id, name: s.role.name } : null,
  permissions: permissionsOf(s),
  disabled: s.disabledAt !== null,
})
const withRole = { role: true } as const

@Injectable()
export class StaffAuthService {
  private dummyHash: Promise<string> | null = null

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly clock: Clock
  ) {}

  /** Создание сотрудника (раздел «Сотрудники», CLI create-admin). Логин — телефон. */
  async createStaff(input: StaffInput, actorId: string | null = null, ip: string | null = null): Promise<StaffUser> {
    const phone = this.phoneOrThrow(input.phone)
    this.assertPassword(input.password)
    if (!input.isOwner && !input.roleId) {
      throw new HttpException({ code: 'BAD_REQUEST', message: 'Выберите роль' }, HttpStatus.BAD_REQUEST)
    }
    try {
      const staff = await this.prisma.staff.create({
        data: {
          phone,
          firstName: input.firstName.trim(),
          lastName: input.lastName.trim(),
          passwordHash: await hash(input.password),
          isOwner: input.isOwner === true,
          roleId: input.isOwner ? null : input.roleId,
        },
        include: withRole,
      })
      await this.audit.log({
        actorType: actorId ? 'staff' : 'system',
        actorId,
        action: 'staff.created',
        entityType: 'staff',
        entityId: staff.id,
        meta: { roleId: input.roleId ?? null, isOwner: input.isOwner === true },
        ip,
      })
      return toUser(staff)
    } catch (e) {
      if ((e as { code?: string }).code === 'P2002') {
        throw new ConflictException({ code: 'PHONE_TAKEN', message: 'Сотрудник с таким телефоном уже есть' })
      }
      if ((e as { code?: string }).code === 'P2003') {
        throw new HttpException({ code: 'ROLE_NOT_FOUND', message: 'Роль не найдена' }, HttpStatus.BAD_REQUEST)
      }
      throw e
    }
  }

  async list(): Promise<StaffUser[]> {
    return (
      await this.prisma.staff.findMany({
        orderBy: [{ isOwner: 'desc' }, { disabledAt: 'asc' }, { createdAt: 'asc' }],
        include: withRole,
      })
    ).map(toUser)
  }

  /**
   * Изменить сотрудника. Владельца нельзя отключить или перевести на роль; себя отключить нельзя.
   * Отключение закрывает сессии; права роли меняются в «Ролях» и действуют сразу.
   */
  async update(
    id: string,
    patch: Partial<Pick<StaffInput, 'firstName' | 'lastName' | 'phone' | 'roleId'>> & { disabled?: boolean },
    actorId: string,
    ip: string | null
  ): Promise<StaffUser> {
    const before = await this.prisma.staff.findUnique({ where: { id } })
    if (!before) throw new HttpException({ code: 'NOT_FOUND', message: 'Сотрудник не найден' }, HttpStatus.NOT_FOUND)
    if (before.isOwner && (patch.disabled === true || patch.roleId !== undefined)) {
      throw new ConflictException({ code: 'OWNER_LOCKED', message: 'Владельца нельзя отключить или перевести на роль' })
    }
    if (id === actorId && patch.disabled === true) {
      throw new ConflictException({ code: 'SELF_LOCKOUT', message: 'Нельзя отключить себя' })
    }
    const phone = patch.phone !== undefined ? this.phoneOrThrow(patch.phone) : undefined
    const revoke = patch.disabled === true
    try {
      const staff = await this.prisma.$transaction(async (tx) => {
        const s = await tx.staff.update({
          where: { id },
          data: {
            ...(patch.firstName !== undefined && { firstName: patch.firstName.trim() }),
            ...(patch.lastName !== undefined && { lastName: patch.lastName.trim() }),
            ...(phone && { phone }),
            ...(patch.roleId && { roleId: patch.roleId }),
            ...(patch.disabled !== undefined && { disabledAt: patch.disabled ? this.clock.now() : null }),
          },
          include: withRole,
        })
        if (revoke)
          await tx.staffSession.updateMany({
            where: { staffId: id, revokedAt: null },
            data: { revokedAt: this.clock.now() },
          })
        await this.audit.log(
          {
            actorType: 'staff',
            actorId,
            action: 'staff.updated',
            entityType: 'staff',
            entityId: id,
            meta: { fields: Object.keys(patch) },
            ip,
          },
          tx
        )
        return s
      })
      return toUser(staff)
    } catch (e) {
      if ((e as { code?: string }).code === 'P2002') {
        throw new ConflictException({ code: 'PHONE_TAKEN', message: 'Сотрудник с таким телефоном уже есть' })
      }
      if ((e as { code?: string }).code === 'P2003') {
        throw new HttpException({ code: 'ROLE_NOT_FOUND', message: 'Роль не найдена' }, HttpStatus.BAD_REQUEST)
      }
      throw e
    }
  }

  /** Новый пароль сотруднику: старые сессии закрываются, блокировка снимается. */
  async setPassword(id: string, password: string, actorId: string, ip: string | null): Promise<void> {
    this.assertPassword(password)
    const passwordHash = await hash(password)
    await this.prisma.$transaction(async (tx) => {
      await tx.staff.update({ where: { id }, data: { passwordHash, failedLogins: 0, lockedUntil: null } })
      await tx.staffSession.updateMany({
        where: { staffId: id, revokedAt: null },
        data: { revokedAt: this.clock.now() },
      })
      await this.audit.log(
        { actorType: 'staff', actorId, action: 'staff.password_set', entityType: 'staff', entityId: id, ip },
        tx
      )
    })
  }

  /** Перевод учётки со старого email-логина на телефон (CLI staff-set-phone). */
  async setPhoneByEmail(email: string, phone: string): Promise<StaffUser> {
    const staff = await this.prisma.staff.findUnique({ where: { email: email.trim().toLowerCase() } })
    if (!staff) throw new Error('Сотрудник с таким email не найден')
    const updated = await this.prisma.staff.update({
      where: { id: staff.id },
      data: { phone: this.phoneOrThrow(phone) },
      include: withRole,
    })
    await this.audit.log({
      actorType: 'system',
      action: 'staff.updated',
      entityType: 'staff',
      entityId: staff.id,
      meta: { fields: ['phone'] },
    })
    return toUser(updated)
  }

  /**
   * Вход по телефону и паролю (решения заказчика 14.11.2026: телефон вместо email, без второго фактора) → сессия.
   * Старые учётки, которым ещё не задан телефон, входят по email. Ответ одинаковый для неизвестного логина и неверного пароля.
   */
  async login(login: string, password: string, ip: string | null) {
    const phone = normalizeUzPhone(login)
    const where = login.includes('@') ? { email: login.trim().toLowerCase() } : phone ? { phone } : null
    const staff = where ? await this.prisma.staff.findUnique({ where }) : null
    if (!staff || staff.disabledAt) {
      await verify(await this.dummy(), password).catch(() => false)
      throw this.invalid('INVALID_CREDENTIALS', 'Неверный телефон или пароль')
    }
    this.assertNotLocked(staff)
    if (!(await verify(staff.passwordHash, password))) {
      await this.fail(staff)
      throw this.invalid('INVALID_CREDENTIALS', 'Неверный телефон или пароль')
    }

    const token = randomBytes(32).toString('base64url')
    const csrfToken = randomBytes(24).toString('base64url')
    const now = this.clock.now()
    const updated = await this.prisma.$transaction(async (tx) => {
      const s = await tx.staff.update({
        where: { id: staff.id },
        data: { failedLogins: 0, lockedUntil: null },
        include: withRole,
      })
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
      include: { staff: { include: withRole } },
    })
    if (!s || s.revokedAt || s.expiresAt <= this.clock.now() || s.staff.disabledAt) return null
    return {
      id: s.staffId,
      isOwner: s.staff.isOwner,
      permissions: permissionsOf(s.staff),
      sessionId: s.id,
      csrfToken: s.csrfToken,
    }
  }

  async me(staffId: string): Promise<StaffUser> {
    return toUser(await this.prisma.staff.findUniqueOrThrow({ where: { id: staffId }, include: withRole }))
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

  private phoneOrThrow(input: string): string {
    const phone = normalizeUzPhone(input)
    if (!phone)
      throw new HttpException(
        { code: 'BAD_PHONE', message: 'Телефон в формате +998 XX XXX XX XX' },
        HttpStatus.BAD_REQUEST
      )
    return phone
  }

  private assertPassword(password: string) {
    if (password.length < MIN_PASSWORD) {
      throw new HttpException(
        { code: 'WEAK_PASSWORD', message: `Пароль — не короче ${MIN_PASSWORD} символов` },
        HttpStatus.BAD_REQUEST
      )
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
