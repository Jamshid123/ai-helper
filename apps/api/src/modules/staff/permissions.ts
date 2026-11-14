/**
 * Модули админки и уровни доступа (решение заказчика 14.11.2026). Роль хранит { модуль: уровень };
 * модуля нет — нет доступа. Сотрудники и роли — только владелец. Обзор доступен всем сотрудникам.
 */
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
export type Permissions = Partial<Record<AdminModule, Level>>

/** Только известные модули и уровни — мусор из БД или запроса отбрасывается. */
export function sanitizePermissions(raw: unknown): Permissions {
  const out: Permissions = {}
  if (!raw || typeof raw !== 'object') return out
  for (const m of MODULES) {
    const v = (raw as Record<string, unknown>)[m]
    if (v === 'view' || v === 'edit') out[m] = v
  }
  return out
}

export function allows(perms: Permissions, module: AdminModule, need: Level): boolean {
  const have = perms[module]
  return have === 'edit' || (have === 'view' && need === 'view')
}

export const ALL_EDIT: Permissions = Object.fromEntries(MODULES.map((m) => [m, 'edit'])) as Permissions
