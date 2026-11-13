import { redirect } from '@tanstack/react-router'
import { type StaffUser } from '@/features/auth/api'
import { canAccess, type Section } from './rbac'

/** beforeLoad-guard раздела: без нужной роли — на 403. Сервер проверяет права независимо. */
export function requireSection(section: Section) {
  return ({ context }: { context: { user: StaffUser } }) => {
    if (!canAccess(context.user.roles, section)) {
      throw redirect({ to: '/403' })
    }
  }
}
