import { api } from '@/lib/api'

export type StaffUser = {
  id: string
  name: string
  firstName?: string
  lastName?: string
  phone: string | null
  email?: string | null
  roles: string[]
}

/**
 * Демо-режим без backend: работает ТОЛЬКО в `vite dev` и только при
 * VITE_DEMO_AUTH=true. В production-сборке `import.meta.env.DEV === false`,
 * и эта ветка вырезается при сборке.
 */
const DEMO = import.meta.env.DEV && import.meta.env.VITE_DEMO_AUTH === 'true'

function demoUser(): StaffUser {
  const roles = (import.meta.env.VITE_DEMO_ROLES ?? 'ADMIN')
    .split(',')
    .map((r: string) => r.trim())
    .filter(Boolean)
  return {
    id: 'demo',
    name: 'Демо Сотрудник',
    phone: '+998900000000',
    roles,
  }
}

let demoSignedIn = false

/** Вход по телефону и паролю (решения заказчика 14.11.2026). Сервер ставит httpOnly-cookie сессии. */
export async function login(
  login: string,
  password: string
): Promise<StaffUser> {
  if (DEMO) {
    demoSignedIn = true
    return demoUser()
  }
  return api<StaffUser>('/admin/auth/login', {
    method: 'POST',
    body: { login, password },
  })
}

export async function fetchMe(): Promise<StaffUser> {
  if (DEMO) {
    if (!demoSignedIn) throw Object.assign(new Error('demo'), { status: 401 })
    return demoUser()
  }
  return api<StaffUser>('/admin/me')
}

export async function logout(): Promise<void> {
  if (DEMO) {
    demoSignedIn = false
    return
  }
  await api<void>('/admin/auth/logout', { method: 'POST' })
}
