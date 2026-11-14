import { toast } from 'sonner'
import { ApiError } from './api'

/** Человекочитаемое сообщение об ошибке запроса. Детали ошибки сервер не раскрывает. */
export function serverErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    // бизнес-отказы сервера (400/409/422) приходят с понятным текстом — показываем его
    const known = error.code !== 'UNKNOWN' && Boolean(error.message)
    if ([400, 409, 422, 423].includes(error.status) && known)
      return error.message
    if (error.status === 403) return 'Недостаточно прав для этого действия.'
    if (error.status === 404) return 'Объект не найден.'
    if (error.status === 409)
      return 'Данные изменились. Обновите страницу и повторите.'
    if (error.status === 429)
      return 'Слишком много запросов. Подождите немного.'
    if (error.status >= 500) return 'Ошибка сервера. Попробуйте позже.'
    if (error.message) return error.message
  }
  return 'Что-то пошло не так.'
}

export function handleServerError(error: unknown) {
  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.error(error)
  }
  toast.error(serverErrorMessage(error))
}
