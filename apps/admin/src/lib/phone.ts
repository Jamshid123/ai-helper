/**
 * Маска телефона Узбекистана для полей ввода: «+998 XX XXX XX XX».
 * Сервер всё равно нормализует номер сам (`normalizeUzPhone`), маска — только для удобства ввода.
 */
const CODE = '998'

function format(local: string): string {
  const d = local.slice(0, 9)
  if (!d) return ''
  const parts = [
    d.slice(0, 2),
    d.slice(2, 5),
    d.slice(5, 7),
    d.slice(7, 9),
  ].filter(Boolean)
  return `+${CODE} ${parts.join(' ')}`
}

function localDigits(input: string): string {
  const digits = input.replace(/\D/g, '')
  if (input.trim().startsWith('+'))
    return digits.startsWith(CODE) ? digits.slice(CODE.length) : ''
  // без плюса: вставили «998901234567» — это код страны; иначе цифры — сам номер
  return digits.length > 9 && digits.startsWith(CODE)
    ? digits.slice(CODE.length)
    : digits
}

/**
 * Отформатировать новое значение поля. `prev` — значение до правки: так отличаем набор кода
 * («+», «+9», «+99» → оставляем как есть) от стирания (стёрли часть кода → поле пустое).
 * Строку с буквами или «@» (вход по email у старых учёток) не трогаем.
 */
export function formatPhoneInput(next: string, prev = ''): string {
  if (/[a-zа-я@]/i.test(next)) return next
  const typing = next.length > prev.length
  if (next.trim().startsWith('+')) {
    const digits = next.replace(/\D/g, '')
    if (CODE.startsWith(digits)) {
      if (!typing) return ''
      return digits === CODE ? `+${CODE} ` : `+${digits}`
    }
  }
  return format(localDigits(next))
}

/** Введены все 9 цифр номера после +998. */
export function isCompleteUzPhone(input: string): boolean {
  return localDigits(input).length >= 9
}
