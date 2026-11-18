import type { CategoryField, FieldType } from '@auksion/shared'
import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { fieldKey } from './fields-draft'

const TYPES: { id: FieldType; text: string }[] = [
  { id: 'text', text: 'Текст' },
  { id: 'number', text: 'Число' },
  { id: 'boolean', text: 'Да / нет' },
  { id: 'date', text: 'Дата' },
  { id: 'list', text: 'Список' },
]

/**
 * Поля карточки товара у категории (решение 18.11.2026): название ru/uz, тип, обязательное, показывать покупателю.
 * Код поля задаётся один раз при создании и не меняется — по нему хранятся значения у товаров.
 */
export function CategoryFieldsEditor({
  fields,
  saved,
  onChange,
}: {
  fields: CategoryField[]
  /** Коды полей, уже сохранённых у категории: их код не меняется. */
  saved: string[]
  onChange: (f: CategoryField[]) => void
}) {
  const set = (i: number, patch: Partial<CategoryField>) =>
    onChange(fields.map((f, k) => (k === i ? { ...f, ...patch } : f)))
  const add = () =>
    onChange([
      ...fields,
      {
        key: '',
        labelRu: '',
        labelUz: '',
        type: 'text',
        required: false,
        public: true,
      },
    ])

  return (
    <div className='grid gap-3'>
      {fields.length === 0 && (
        <p className='text-sm text-muted-foreground'>
          Полей пока нет — у товаров этой категории будут только название,
          описание и фото.
        </p>
      )}
      {fields.map((f, i) => {
        const fixed = saved.includes(f.key)
        return (
          <fieldset
            key={i}
            className='grid gap-2 rounded-md border p-3'
            aria-label={`Поле ${i + 1}`}
          >
            <div className='grid grid-cols-1 gap-2 sm:grid-cols-2'>
              <Input
                aria-label={`Поле ${i + 1}: название на русском`}
                placeholder='Название на русском'
                value={f.labelRu}
                maxLength={60}
                onChange={(e) => {
                  const labelRu = e.target.value
                  const others = fields
                    .filter((_, k) => k !== i)
                    .map((x) => x.key)
                  set(i, {
                    labelRu,
                    ...(!fixed && {
                      key: fieldKey(f.labelUz || labelRu, others),
                    }),
                  })
                }}
              />
              <Input
                aria-label={`Поле ${i + 1}: название на узбекском`}
                placeholder='Maydon nomi (oʻzbekcha)'
                value={f.labelUz}
                maxLength={60}
                onChange={(e) => {
                  const labelUz = e.target.value
                  const others = fields
                    .filter((_, k) => k !== i)
                    .map((x) => x.key)
                  set(i, {
                    labelUz,
                    ...(!fixed && {
                      key: fieldKey(labelUz || f.labelRu, others),
                    }),
                  })
                }}
              />
            </div>
            <div className='flex flex-wrap items-center gap-x-4 gap-y-2'>
              <Select
                value={f.type}
                onValueChange={(v) =>
                  set(i, {
                    type: v as FieldType,
                    options: v === 'list' ? (f.options ?? []) : undefined,
                  })
                }
              >
                <SelectTrigger
                  className='w-36'
                  aria-label={`Поле ${i + 1}: тип`}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TYPES.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.text}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <label className='flex items-center gap-2 text-sm'>
                <Switch
                  checked={f.required}
                  onCheckedChange={(v) => set(i, { required: v })}
                />
                Обязательное
              </label>
              <label className='flex items-center gap-2 text-sm'>
                <Switch
                  checked={f.public}
                  onCheckedChange={(v) => set(i, { public: v })}
                />
                Показывать покупателю
              </label>
              <span className='font-mono text-xs text-muted-foreground'>
                {f.key || '—'}
              </span>
              <Button
                variant='ghost'
                size='sm'
                className='ms-auto'
                aria-label={`Удалить поле ${i + 1}`}
                onClick={() => onChange(fields.filter((_, k) => k !== i))}
              >
                <Trash2 />
              </Button>
            </div>
            {f.type === 'list' && (
              <Textarea
                rows={3}
                aria-label={`Поле ${i + 1}: варианты`}
                placeholder='Варианты — по одному в строке'
                value={(f.options ?? []).join('\n')}
                onChange={(e) =>
                  set(i, {
                    options: e.target.value
                      .split('\n')
                      .map((x) => x.trimStart())
                      .filter((x, k, a) => x || k === a.length - 1),
                  })
                }
              />
            )}
          </fieldset>
        )
      })}
      <Button
        variant='outline'
        size='sm'
        className='justify-self-start'
        onClick={add}
        disabled={fields.length >= 20}
      >
        <Plus /> Добавить поле
      </Button>
      <p className='text-xs text-muted-foreground'>
        Изменения коснутся новых товаров и лотов. Идущие лоты не изменятся. Не
        вносите в поля персональные данные (паспорт, телефон, ФИО): значения
        видны на карточке лота.
      </p>
    </div>
  )
}
