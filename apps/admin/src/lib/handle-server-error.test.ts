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
    expect(serverErrorMessage(new ApiError(status, 'X', 'raw'))).toBe(text)
  })

  it('для 4xx берёт безопасное сообщение сервера', () => {
    expect(
      serverErrorMessage(
        new ApiError(400, 'BID_TOO_LOW', 'Ставка ниже минимальной')
      )
    ).toBe('Ставка ниже минимальной')
  })

  it('неизвестная ошибка — общий текст', () => {
    expect(serverErrorMessage(new Error('boom'))).toBe('Что-то пошло не так.')
  })
})
