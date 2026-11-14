/**
 * Права сотрудника в админке (решение заказчика 14.11.2026): владелец настраивает роли —
 * по каждому модулю «нет доступа», «просмотр» или «изменение». Источник прав — ответ `/admin/me`.
 * Это только UX (меню, кнопки): каждое действие проверяется на сервере.
 */
export const SECTIONS = [
  'dashboard',
  'schedule',
  'categories',
  'products',
  'lots',
  'sellers',
  'inspection',
  'risk',
  'participants',
  'finance',
  'fulfillment',
  'staff',
  'roles',
  'audit',
] as const
export type Section = (typeof SECTIONS)[number]

/** Модули с настраиваемыми правами (совпадают с API `modules/staff/permissions.ts`). */
export const MODULES = [
  'schedule',
  'categories',
  'products',
  'lots',
  'sellers',
  'inspection',
  'risk',
  'participants',
  'finance',
  'fulfillment',
  'audit',
] as const
export type AdminModule = (typeof MODULES)[number]
export type Level = 'view' | 'edit'
export type Access = {
  isOwner?: boolean
  permissions?: Partial<Record<string, Level>>
}

const OWNER_ONLY: readonly Section[] = ['staff', 'roles']

function level(a: Access | null | undefined, section: Section): Level | null {
  if (!a) return null
  if (a.isOwner) return 'edit'
  if (section === 'dashboard') return 'view'
  if (OWNER_ONLY.includes(section)) return null
  const v = a.permissions?.[section]
  return v === 'view' || v === 'edit' ? v : null
}

/** Виден ли раздел (просмотр или изменение). */
export function canAccess(
  a: Access | null | undefined,
  section: Section
): boolean {
  return level(a, section) !== null
}

/** Можно ли менять данные раздела (показывать кнопки действий). */
export function canEdit(
  a: Access | null | undefined,
  section: Section
): boolean {
  return level(a, section) === 'edit'
}
