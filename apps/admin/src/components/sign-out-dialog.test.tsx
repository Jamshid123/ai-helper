import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { userEvent } from 'vitest/browser'
import { SignOutDialog } from './sign-out-dialog'

const navigate = vi.fn()
const reset = vi.fn()
const clear = vi.fn()
const logout = vi.fn()

vi.mock('@/stores/auth-store', () => ({
  useAuthStore: (sel: (s: { reset: () => void }) => unknown) => sel({ reset }),
}))
vi.mock('@/features/auth/api', () => ({ logout: () => logout() }))
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ clear }) }))
vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>()
  return { ...actual, useNavigate: () => navigate }
})

describe('SignOutDialog', () => {
  beforeEach(() => vi.clearAllMocks())

  it('завершает сессию на сервере, очищает состояние и ведёт на вход', async () => {
    logout.mockResolvedValue(undefined)
    const { getByRole } = await render(
      <SignOutDialog open onOpenChange={vi.fn()} />
    )
    await userEvent.click(getByRole('button', { name: /^Выйти$/ }))
    await vi.waitFor(() => expect(navigate).toHaveBeenCalled())
    expect(logout).toHaveBeenCalledOnce()
    expect(reset).toHaveBeenCalledOnce()
    expect(clear).toHaveBeenCalledOnce()
    expect(navigate).toHaveBeenCalledWith({ to: '/sign-in', replace: true })
  })

  it('очищает локальное состояние, даже если сервер недоступен', async () => {
    logout.mockRejectedValue(new Error('network'))
    const { getByRole } = await render(
      <SignOutDialog open onOpenChange={vi.fn()} />
    )
    await userEvent.click(getByRole('button', { name: /^Выйти$/ }))
    await vi.waitFor(() => expect(navigate).toHaveBeenCalled())
    expect(reset).toHaveBeenCalledOnce()
  })

  it('«Отмена» ничего не делает', async () => {
    const { getByRole } = await render(
      <SignOutDialog open onOpenChange={vi.fn()} />
    )
    await userEvent.click(getByRole('button', { name: /^Отмена$/ }))
    expect(logout).not.toHaveBeenCalled()
    expect(navigate).not.toHaveBeenCalled()
  })
})
