/**
 * Роли сотрудников и доступ к разделам админки.
 *
 * Это только UX: меню и маршруты скрываются по ролям, но каждое действие
 * обязательно проверяется на сервере. Источник ролей — ответ `/admin/me`.
 * Роли из ТЗ: оператор, эксперт, риск-менеджер, финансист, выдача, поддержка.
 * ADMIN — управление сотрудниками и журнал аудита (в ТЗ не описан, нужен для эксплуатации).
 */
export const ROLES = [
  'ADMIN',
  'OPERATOR',
  'EXPERT',
  'RISK',
  'FINANCE',
  'FULFILLMENT',
  'SUPPORT',
] as const

export type Role = (typeof ROLES)[number]

export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: 'Администратор',
  OPERATOR: 'Оператор',
  EXPERT: 'Эксперт',
  RISK: 'Риск-менеджер',
  FINANCE: 'Финансы',
  FULFILLMENT: 'Выдача',
  SUPPORT: 'Поддержка',
}

export const SECTIONS = [
  'dashboard',
  'schedule',
  'lots',
  'sellers',
  'inspection',
  'risk',
  'restrictions',
  'finance',
  'fulfillment',
  'staff',
  'audit',
] as const

export type Section = (typeof SECTIONS)[number]

const ALL: readonly Role[] = ROLES

const ACCESS: Record<Section, readonly Role[]> = {
  dashboard: ALL,
  schedule: ['ADMIN', 'OPERATOR'],
  lots: ['ADMIN', 'OPERATOR', 'EXPERT'],
  sellers: ['ADMIN', 'OPERATOR', 'RISK'],
  inspection: ['ADMIN', 'EXPERT'],
  risk: ['ADMIN', 'RISK'],
  restrictions: ['ADMIN', 'RISK', 'SUPPORT'],
  finance: ['ADMIN', 'FINANCE'],
  fulfillment: ['ADMIN', 'FULFILLMENT'],
  staff: ['ADMIN'],
  audit: ['ADMIN'],
}

export function isRole(value: unknown): value is Role {
  return (
    typeof value === 'string' && (ROLES as readonly string[]).includes(value)
  )
}

/** Есть ли у сотрудника хотя бы одна роль с доступом к разделу. Неизвестные роли игнорируются. */
export function canAccess(roles: readonly string[], section: Section): boolean {
  const allowed = ACCESS[section]
  return roles.some((r) => isRole(r) && allowed.includes(r))
}
