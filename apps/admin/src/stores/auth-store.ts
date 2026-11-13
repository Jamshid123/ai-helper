import { create } from 'zustand'
import { type StaffUser } from '@/features/auth/api'

/**
 * Текущий сотрудник в памяти. Токенов здесь нет: сессия живёт в httpOnly-cookie,
 * а данные о пользователе при перезагрузке берутся заново из `/admin/me`.
 */
interface AuthState {
  user: StaffUser | null
  setUser: (user: StaffUser | null) => void
  reset: () => void
}

export const useAuthStore = create<AuthState>()((set) => ({
  user: null,
  setUser: (user) => set({ user }),
  reset: () => set({ user: null }),
}))
