import { useAuthStore } from '@/stores/auth-store'
import { canEdit, type Section } from '@/lib/rbac'

/** Может ли текущий сотрудник менять данные раздела (кнопки действий). Сервер проверяет независимо. */
export function useCanEdit(section: Section): boolean {
  const user = useAuthStore((s) => s.user)
  return canEdit(user, section)
}
