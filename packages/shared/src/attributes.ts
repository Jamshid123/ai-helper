/**
 * Поля карточки товара, которые задаются у категории (решение 18.11.2026: шаблоны товаров, вариант A).
 * Одна проверка на сервере и в админке. Значения — только простой текст/число/да-нет/дата/вариант списка:
 * без HTML и ссылок (на сайте выводятся как текст).
 */
export type FieldType = 'text' | 'number' | 'boolean' | 'date' | 'list'

export type CategoryField = {
  /** Неизменяемый код поля: латиница, цифры, «_». */
  key: string
  labelRu: string
  labelUz: string
  type: FieldType
  required: boolean
  /** Показывать покупателю в блоке «Характеристики». */
  public: boolean
  /** Варианты для type = 'list'. */
  options?: string[]
}

export type AttributeValue = string | number | boolean
export type Attributes = Record<string, AttributeValue>

export const FIELD_LIMITS = {
  MAX_FIELDS: 20,
  MAX_OPTIONS: 30,
  LABEL_MAX: 60,
  OPTION_MAX: 60,
  TEXT_MAX: 200,
  KEY_RE: /^[a-z][a-z0-9_]{1,39}$/,
} as const

const FIELD_TYPES: FieldType[] = ['text', 'number', 'boolean', 'date', 'list']
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/** Проверка набора полей категории. Возвращает список ошибок (пустой — всё верно). */
export function fieldsProblems(fields: unknown): string[] {
  if (!Array.isArray(fields)) return ['Поля — список']
  if (fields.length > FIELD_LIMITS.MAX_FIELDS) return [`Не больше ${FIELD_LIMITS.MAX_FIELDS} полей`]
  const problems: string[] = []
  const keys = new Set<string>()
  fields.forEach((f: Partial<CategoryField>, i) => {
    const at = `Поле ${i + 1}`
    if (typeof f?.key !== 'string' || !FIELD_LIMITS.KEY_RE.test(f.key)) problems.push(`${at}: код — латиница, цифры и «_», 2–40 символов`)
    else if (keys.has(f.key)) problems.push(`${at}: код «${f.key}» повторяется`)
    else keys.add(f.key)
    for (const [label, name] of [
      [f?.labelRu, 'название на русском'],
      [f?.labelUz, 'название на узбекском'],
    ] as const) {
      if (typeof label !== 'string' || !label.trim() || label.length > FIELD_LIMITS.LABEL_MAX) problems.push(`${at}: ${name}`)
    }
    if (!FIELD_TYPES.includes(f?.type as FieldType)) problems.push(`${at}: тип`)
    if (typeof f?.required !== 'boolean' || typeof f?.public !== 'boolean') problems.push(`${at}: флажки`)
    if (f?.type === 'list') {
      const o = f.options
      if (!Array.isArray(o) || o.length < 1 || o.length > FIELD_LIMITS.MAX_OPTIONS) problems.push(`${at}: варианты списка (1–${FIELD_LIMITS.MAX_OPTIONS})`)
      else if (o.some((x) => typeof x !== 'string' || !x.trim() || x.length > FIELD_LIMITS.OPTION_MAX)) problems.push(`${at}: пустой или длинный вариант`)
      else if (new Set(o).size !== o.length) problems.push(`${at}: варианты повторяются`)
    } else if (f?.options !== undefined) problems.push(`${at}: варианты — только у списка`)
  })
  return problems
}

/**
 * Проверка значений товара по полям категории. Лишние ключи — ошибка; пустые значения не хранятся.
 * requireAll=false — не требовать обязательные (старые товары после изменения шаблона).
 */
export function checkAttributes(
  fields: CategoryField[],
  input: unknown,
  { requireAll = true }: { requireAll?: boolean } = {}
): { values: Attributes; problems: string[] } {
  const problems: string[] = []
  const values: Attributes = {}
  if (input === null || typeof input !== 'object' || Array.isArray(input)) return { values, problems: ['Характеристики — объект'] }
  const byKey = new Map(fields.map((f) => [f.key, f]))
  for (const key of Object.keys(input)) if (!byKey.has(key)) problems.push(`Нет поля «${key}» в категории`)
  for (const f of fields) {
    let v = (input as Record<string, unknown>)[f.key]
    if (typeof v === 'string') v = v.trim()
    if (v === undefined || v === null || v === '') {
      if (f.required && requireAll) problems.push(`«${f.labelRu}» — обязательное поле`)
      continue
    }
    const bad = () => problems.push(`«${f.labelRu}»: неверное значение`)
    switch (f.type) {
      case 'text':
        if (typeof v !== 'string' || v.length > FIELD_LIMITS.TEXT_MAX) bad()
        else values[f.key] = v
        break
      case 'number':
        if (typeof v !== 'number' || !Number.isFinite(v) || Math.abs(v) > 1e12) bad()
        else values[f.key] = v
        break
      case 'boolean':
        if (typeof v !== 'boolean') bad()
        else values[f.key] = v
        break
      case 'date':
        if (typeof v !== 'string' || !DATE_RE.test(v) || Number.isNaN(Date.parse(`${v}T00:00:00Z`))) bad()
        else values[f.key] = v
        break
      case 'list':
        if (typeof v !== 'string' || !(f.options ?? []).includes(v)) bad()
        else values[f.key] = v
        break
    }
  }
  return { values, problems }
}

/** Снимок для лота: поля категории + значения товара (только заполненные). */
export type LotAttribute = Pick<CategoryField, 'key' | 'labelRu' | 'labelUz' | 'type' | 'public'> & { value: AttributeValue }

export function snapshotAttributes(fields: CategoryField[], values: Attributes): LotAttribute[] {
  return fields
    .filter((f) => values[f.key] !== undefined)
    .map((f) => ({ key: f.key, labelRu: f.labelRu, labelUz: f.labelUz, type: f.type, public: f.public, value: values[f.key] }))
}
