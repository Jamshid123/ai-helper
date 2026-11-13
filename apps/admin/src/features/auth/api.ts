import { api } from '@/lib/api'

export type StaffUser = {
  id: string
  name: string
  email: string
  roles: string[]
}

export type LoginResult = { challengeId: string }

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
    email: 'demo@auksion.local',
    roles,
  }
}

let demoSignedIn = false

/** Шаг 1: логин и пароль. Сервер отвечает идентификатором MFA-челленджа. */
export async function login(
  email: string,
  password: string
): Promise<LoginResult> {
  if (DEMO) return { challengeId: 'demo' }
  return api<LoginResult>('/admin/auth/login', {
    method: 'POST',
    body: { email, password },
  })
}

/** Шаг 2: TOTP-код. При успехе сервер ставит httpOnly-cookie сессии. */
export async function verifyMfa(
  challengeId: string,
  code: string
): Promise<StaffUser> {
  if (DEMO) {
    demoSignedIn = true
    return demoUser()
  }
  return api<StaffUser>('/admin/auth/mfa', {
    method: 'POST',
    body: { challengeId, code },
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
