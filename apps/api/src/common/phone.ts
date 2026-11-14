/** Телефон Узбекистана → +998XXXXXXXXX (9 цифр после кода страны) или null. */
export function normalizeUzPhone(input: string): string | null {
  const digits = input.replace(/\D/g, '')
  const local = digits.length === 12 && digits.startsWith('998') ? digits.slice(3) : digits.length === 9 ? digits : null
  return local && /^\d{9}$/.test(local) ? `+998${local}` : null
}
