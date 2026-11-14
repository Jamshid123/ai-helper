import { SetMetadata } from '@nestjs/common'
import type { AdminModule } from './permissions'

export const STAFF_MODULE = 'staffModule'
/**
 * Эндпоинт админки: нужна сессия сотрудника (cookie), для мутаций — CSRF-токен.
 * module — право роли на модуль: чтение (GET) требует «просмотр», остальное — «изменение».
 * 'owner' — только владелец (сотрудники, роли). Без аргумента — любой вошедший сотрудник.
 */
export const StaffOnly = (module: AdminModule | 'owner' | 'any' = 'any') => SetMetadata(STAFF_MODULE, module)
