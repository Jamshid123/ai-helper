import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { userEvent } from 'vitest/browser'
import { useAuthStore } from '@/stores/auth-store'
import { ApiError } from '@/lib/api'
import { OtpForm } from './otp-form'

const navigate = vi.fn()
const verifyMfa = vi.fn()
const user = {
  id: 'u1',
  name: 'Эксперт',
  email: 'e@company.uz',
  roles: ['EXPERT'],
}

vi.mock('../../api', () => ({
  verifyMfa: (...a: unknown[]) => verifyMfa(...a),
  fetchMe: vi.fn(),
}))
vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>()
  return { ...actual, useNavigate: () => navigate }
})

function renderForm(redirectTo?: string) {
  const qc = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={qc}>
      <OtpForm challengeId='ch-1' redirectTo={redirectTo} />
    </QueryClientProvider>
  )
}

describe('OtpForm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useAuthStore.getState().reset()
  })

  it('кнопка неактивна, пока не введено 6 цифр', async () => {
    const { getByRole } = await renderForm()
    await expect.element(getByRole('button', { name: 'Войти' })).toBeDisabled()
  })

  it('успешный код сохраняет сотрудника и ведёт на безопасный redirect', async () => {
    verifyMfa.mockResolvedValue(user)
    const { getByRole } = await renderForm('/inspection')
    await userEvent.keyboard('123456')
    await userEvent.click(getByRole('button', { name: 'Войти' }))
    await vi.waitFor(() => expect(navigate).toHaveBeenCalled())
    expect(verifyMfa).toHaveBeenCalledWith('ch-1', '123456')
    expect(useAuthStore.getState().user).toEqual(user)
    expect(navigate).toHaveBeenCalledWith({ to: '/inspection', replace: true })
  })

  it('внешний redirect заменяется на главную', async () => {
    verifyMfa.mockResolvedValue(user)
    const { getByRole } = await renderForm('https://evil.example')
    await userEvent.keyboard('123456')
    await userEvent.click(getByRole('button', { name: 'Войти' }))
    await vi.waitFor(() => expect(navigate).toHaveBeenCalled())
    expect(navigate).toHaveBeenCalledWith({ to: '/', replace: true })
  })

  it('неверный код — сообщение об ошибке, пользователь не сохранён', async () => {
    verifyMfa.mockRejectedValue(new ApiError(401, 'INVALID_OTP', 'x'))
    const { getByRole, getByText } = await renderForm()
    await userEvent.keyboard('000000')
    await userEvent.click(getByRole('button', { name: 'Войти' }))
    await expect
      .element(getByText('Неверный или устаревший код.'))
      .toBeInTheDocument()
    expect(useAuthStore.getState().user).toBeNull()
  })
})
