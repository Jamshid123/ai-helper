import type { CategoryField } from '@auksion/shared'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { AttributeDraft } from './fields-draft'
import { Field } from './ui'

/** Поля карточки товара по шаблону категории (решение 18.11.2026). */
export function AttributeFields({
  fields,
  draft,
  onChange,
}: {
  fields: CategoryField[]
  draft: AttributeDraft
  onChange: (d: AttributeDraft) => void
}) {
  if (fields.length === 0) return null
  const set = (key: string, v: string | boolean) =>
    onChange({ ...draft, [key]: v })
  return (
    <div className='grid grid-cols-1 gap-3 min-[400px]:grid-cols-2'>
      {fields.map((f) => {
        const label = `${f.labelRu}${f.required ? ' *' : ''}`
        const hint = f.public ? undefined : 'Только для сотрудников'
        const value = draft[f.key]
        if (f.type === 'boolean')
          return (
            <label
              key={f.key}
              className='flex items-center gap-2 self-end pb-2 text-sm'
            >
              <Checkbox
                checked={value === true}
                onCheckedChange={(v) => set(f.key, v === true)}
              />
              {label}
            </label>
          )
        if (f.type === 'list')
          return (
            <Field key={f.key} label={label} hint={hint}>
              <Select
                value={typeof value === 'string' && value ? value : undefined}
                onValueChange={(v) => set(f.key, v)}
              >
                <SelectTrigger className='w-full' aria-label={f.labelRu}>
                  <SelectValue placeholder='Выберите' />
                </SelectTrigger>
                <SelectContent>
                  {(f.options ?? []).map((o) => (
                    <SelectItem key={o} value={o}>
                      {o}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          )
        return (
          <Field key={f.key} label={label} hint={hint}>
            <Input
              aria-label={f.labelRu}
              type={f.type === 'date' ? 'date' : 'text'}
              inputMode={f.type === 'number' ? 'decimal' : undefined}
              maxLength={200}
              value={typeof value === 'string' ? value : ''}
              onChange={(e) => set(f.key, e.target.value)}
            />
          </Field>
        )
      })}
    </div>
  )
}
