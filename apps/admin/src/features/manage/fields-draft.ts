import type { Attributes, CategoryField } from '@auksion/shared'

/** Латиница для кода поля: из узбекского (латиница) или русского названия; повтор — с номером. */
const RU: Record<string, string> = {
  а: 'a',
  б: 'b',
  в: 'v',
  г: 'g',
  д: 'd',
  е: 'e',
  ё: 'e',
  ж: 'j',
  з: 'z',
  и: 'i',
  й: 'y',
  к: 'k',
  л: 'l',
  м: 'm',
  н: 'n',
  о: 'o',
  п: 'p',
  р: 'r',
  с: 's',
  т: 't',
  у: 'u',
  ф: 'f',
  х: 'h',
  ц: 's',
  ч: 'ch',
  ш: 'sh',
  щ: 'sh',
  ы: 'i',
  э: 'e',
  ю: 'yu',
  я: 'ya',
}
export function fieldKey(label: string, taken: string[]): string {
  const base =
    label
      .toLowerCase()
      .split('')
      .map((ch) => RU[ch] ?? ch)
      .join('')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^[^a-z]+|_+$/g, '')
      .slice(0, 30) || 'field'
  const key = base.length < 2 ? `${base}_f` : base
  let k = key
  for (let i = 2; taken.includes(k); i++) k = `${key}_${i}`
  return k
}

/** Значения в форме: строки для полей ввода, да/нет — boolean. */
export type AttributeDraft = Record<string, string | boolean>

export function toAttributeDraft(
  fields: CategoryField[],
  values: Attributes
): AttributeDraft {
  return Object.fromEntries(
    fields.map((f) => {
      const v = values[f.key]
      return [
        f.key,
        f.type === 'boolean' ? v === true : v === undefined ? '' : String(v),
      ]
    })
  )
}

/** Для сервера: пустые — не отправляем, число — числом. Проверка — та же функция, что на сервере. */
export function fromAttributeDraft(
  fields: CategoryField[],
  draft: AttributeDraft
): Attributes {
  const out: Attributes = {}
  for (const f of fields) {
    const v = draft[f.key]
    if (f.type === 'boolean') {
      if (v === true) out[f.key] = true
      continue
    }
    const s = typeof v === 'string' ? v.trim() : ''
    if (!s) continue
    out[f.key] = f.type === 'number' ? Number(s.replace(',', '.')) : s
  }
  return out
}

/** Перед сохранением: пустые строки вариантов убрать, пробелы по краям — тоже. */
export function cleanFields(fields: CategoryField[]): CategoryField[] {
  return fields.map((f) => ({
    ...f,
    labelRu: f.labelRu.trim(),
    labelUz: f.labelUz.trim(),
    ...(f.type === 'list'
      ? { options: (f.options ?? []).map((x) => x.trim()).filter(Boolean) }
      : { options: undefined }),
  }))
}
