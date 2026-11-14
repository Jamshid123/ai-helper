import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { userEvent } from 'vitest/browser'
import { ApiError } from '@/lib/api'
import { UserAuthForm } from './user-auth-form'

const navigate = vi.fn()
const login = vi.fn()

vi.mock('../../api', () => ({
  login: (...a: unknown[]) => login(...a),
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
      <UserAuthForm redirectTo={redirectTo} />
    </QueryClientProvider>
  )
}

describe('UserAuthForm', () => {
  beforeEach(() => vi.clearAllMocks())

  it('не отправляет пустую форму', async () => {
    const { getByRole, getByText } = await renderForm()
    await userEvent.click(getByRole('button', { name: 'Войти' }))
    await expect.element(getByText('Введите телефон.')).toBeInTheDocument()
    expect(login).not.toHaveBeenCalled()
  })

  it('после пароля сразу входит и уходит на redirect', async () => {
    login.mockResolvedValue({
      id: 'u1',
      name: 'Оператор',
      phone: '+998901234567',
      permissions: { lots: 'edit' },
    })
    const { getByLabelText, getByRole } = await renderForm('/lots')
    await userEvent.fill(getByLabelText('Телефон'), '+998 90 123 45 67')
    await userEvent.fill(getByLabelText('Пароль'), 'correct horse')
    await userEvent.click(getByRole('button', { name: 'Войти' }))
    await vi.waitFor(() => expect(navigate).toHaveBeenCalled())
    expect(login).toHaveBeenCalledWith('+998 90 123 45 67', 'correct horse')
    expect(navigate).toHaveBeenCalledWith({ to: '/lots', replace: true })
  })

  it('на 401 показывает понятную ошибку и не уходит со страницы', async () => {
    login.mockRejectedValue(new ApiError(401, 'INVALID_CREDENTIALS', 'x'))
    const { getByLabelText, getByRole, getByText } = await renderForm()
    await userEvent.fill(getByLabelText('Телефон'), '+998 90 123 45 67')
    await userEvent.fill(getByLabelText('Пароль'), 'wrong')
    await userEvent.click(getByRole('button', { name: 'Войти' }))
    await expect
      .element(getByText('Неверный телефон или пароль.'))
      .toBeInTheDocument()
    expect(navigate).not.toHaveBeenCalled()
  })
})
