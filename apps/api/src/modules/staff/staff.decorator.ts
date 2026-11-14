import { SetMetadata } from '@nestjs/common'
import type { StaffRole } from '@prisma/client'

export const STAFF_ROLES = 'staffRoles'
/**
 * Эндпоинт админки: нужна сессия сотрудника (cookie), для мутаций — CSRF-токен.
 * Пустой список ролей — любой сотрудник; ADMIN допускается везде.
 */
export const StaffOnly = (...roles: StaffRole[]) => SetMetadata(STAFF_ROLES, roles)
