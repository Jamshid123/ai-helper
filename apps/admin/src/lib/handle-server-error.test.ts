import { describe, expect, it } from 'vitest'
import { ApiError } from './api'
import { serverErrorMessage } from './handle-server-error'

describe('serverErrorMessage', () => {
  it.each([
    [403, 'Недостаточно прав для этого действия.'],
    [409, 'Данные изменились. Обновите страницу и повторите.'],
    [500, 'Ошибка сервера. Попробуйте позже.'],
    [503, 'Ошибка сервера. Попробуйте позже.'],
  ])('статус %i', (status, text) => {
    // без кода от сервера — общий текст
    expect(serverErrorMessage(new ApiError(status, 'UNKNOWN', 'raw'))).toBe(
      text
    )
  })

  it('для 4xx берёт безопасное сообщение сервера', () => {
    expect(
      serverErrorMessage(
        new ApiError(400, 'BID_TOO_LOW', 'Ставка ниже минимальной')
      )
    ).toBe('Ставка ниже минимальной')
  })

  it('бизнес-отказ 409/422 с кодом — показываем понятный текст сервера', () => {
    expect(
      serverErrorMessage(
        new ApiError(409, 'LOT_LOCKED', 'После открытия торгов лот не меняется')
      )
    ).toBe('После открытия торгов лот не меняется')
    expect(
      serverErrorMessage(
        new ApiError(422, 'STEP_TOO_SMALL', 'Шаг — не меньше 100000 сум')
      )
    ).toBe('Шаг — не меньше 100000 сум')
  })

  it('неизвестная ошибка — общий текст', () => {
    expect(serverErrorMessage(new Error('boom'))).toBe('Что-то пошло не так.')
  })
})
