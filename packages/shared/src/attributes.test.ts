import { describe, expect, it } from 'vitest'
import { type CategoryField, checkAttributes, fieldsProblems, snapshotAttributes } from './attributes'

const fields: CategoryField[] = [
  { key: 'cpu', labelRu: 'Процессор', labelUz: 'Protsessor', type: 'text', required: true, public: true },
  { key: 'ram_gb', labelRu: 'Память, ГБ', labelUz: 'Xotira, GB', type: 'number', required: false, public: true },
  { key: 'charger', labelRu: 'Зарядка', labelUz: 'Quvvatlagich', type: 'boolean', required: false, public: true },
  { key: 'bought', labelRu: 'Куплен', labelUz: 'Sotib olingan', type: 'date', required: false, public: false },
  { key: 'color', labelRu: 'Цвет', labelUz: 'Rang', type: 'list', required: false, public: true, options: ['Серый', 'Белый'] },
]

describe('поля категории', () => {
  it('верный набор проходит; ошибки — по-русски и по номеру поля', () => {
    expect(fieldsProblems(fields)).toEqual([])
    expect(fieldsProblems('x')).toEqual(['Поля — список'])
    const bad = fieldsProblems([
      { key: 'Bad Key', labelRu: '', labelUz: 'a', type: 'html', required: 1, public: true },
      { ...fields[0] },
      { ...fields[0] },
      { ...fields[4], options: [] },
      { ...fields[0], key: 'x2', options: ['a'] },
    ])
    expect(bad).toEqual([
      'Поле 1: код — латиница, цифры и «_», 2–40 символов',
      'Поле 1: название на русском',
      'Поле 1: тип',
      'Поле 1: флажки',
      'Поле 3: код «cpu» повторяется',
      'Поле 4: варианты списка (1–30)',
      'Поле 5: варианты — только у списка',
    ])
    expect(fieldsProblems(Array.from({ length: 21 }, (_, i) => ({ ...fields[0], key: `f${i}` })))).toEqual(['Не больше 20 полей'])
  })
})

describe('значения товара', () => {
  it('проверка типов, обязательных и лишних ключей; пустые не хранятся', () => {
    const ok = checkAttributes(fields, { cpu: ' M2 ', ram_gb: 16, charger: true, bought: '2025-03-01', color: 'Серый', ram: undefined })
    expect(ok.problems).toEqual(['Нет поля «ram» в категории'])
    expect(checkAttributes(fields, { cpu: 'M2', ram_gb: 16, charger: false, bought: '2025-03-01', color: 'Белый' })).toEqual({
      values: { cpu: 'M2', ram_gb: 16, charger: false, bought: '2025-03-01', color: 'Белый' },
      problems: [],
    })
    expect(checkAttributes(fields, { cpu: '', ram_gb: '16', color: 'Красный', bought: '01.03.2025' }).problems).toEqual([
      '«Процессор» — обязательное поле',
      '«Память, ГБ»: неверное значение',
      '«Куплен»: неверное значение',
      '«Цвет»: неверное значение',
    ])
    expect(checkAttributes(fields, {}, { requireAll: false })).toEqual({ values: {}, problems: [] })
    expect(checkAttributes(fields, { cpu: 'x'.repeat(201) }).problems).toEqual(['«Процессор»: неверное значение'])
    expect(checkAttributes(fields, [] as unknown).problems).toEqual(['Характеристики — объект'])
  })

  it('снимок для лота — только заполненные поля, с подписями', () => {
    expect(snapshotAttributes(fields, { cpu: 'M2', bought: '2025-03-01' })).toEqual([
      { key: 'cpu', labelRu: 'Процессор', labelUz: 'Protsessor', type: 'text', public: true, value: 'M2' },
      { key: 'bought', labelRu: 'Куплен', labelUz: 'Sotib olingan', type: 'date', public: false, value: '2025-03-01' },
    ])
  })
})
