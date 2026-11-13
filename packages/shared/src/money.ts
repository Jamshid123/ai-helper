/** Деньги — целые сумы. В JSON приходят строкой, в коде — bigint. Никакого float. */
export type Locale = 'ru' | 'uz'

export function parseSum(value: string): bigint {
  if (!/^\d+$/.test(value)) throw new Error(`Invalid sum: ${value}`)
  return BigInt(value)
}

/** «2 100 000 сум» / «2 100 000 soʻm». Разделитель — неразрывный пробел. */
export function formatSum(value: bigint | string, locale: Locale = 'ru', withUnit = true): string {
  const digits = (typeof value === 'bigint' ? value : parseSum(value)).toString()
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
  if (!withUnit) return grouped
  return `${grouped} ${locale === 'uz' ? 'soʻm' : 'сум'}`
}
