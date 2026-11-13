import { beforeEach, describe, expect, it } from 'vitest'
import { useAuthStore } from './auth-store'

const user = {
  id: 'u1',
  name: 'Тест',
  email: 't@example.com',
  roles: ['EXPERT'],
}

describe('useAuthStore', () => {
  beforeEach(() => useAuthStore.getState().reset())

  it('по умолчанию пользователя нет', () => {
    expect(useAuthStore.getState().user).toBeNull()
  })

  it('setUser и reset', () => {
    useAuthStore.getState().setUser(user)
    expect(useAuthStore.getState().user).toEqual(user)
    useAuthStore.getState().reset()
    expect(useAuthStore.getState().user).toBeNull()
  })

  it('ничего не пишет в cookie (сессия только httpOnly с сервера)', () => {
    const before = document.cookie
    useAuthStore.getState().setUser(user)
    expect(document.cookie).toBe(before)
  })
})
