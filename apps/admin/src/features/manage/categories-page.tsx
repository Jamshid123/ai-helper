import { useState } from 'react'
import { SECTIONS_BY_ID } from '@/config/sections'
import { type CategoryField, fieldsProblems } from '@auksion/shared'
import { Plus } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { PageShell } from '@/components/layout/page-shell'
import { type Category, useCategories, useSaveCategory } from './api'
import { CategoryFieldsEditor } from './category-fields'
import { cleanFields } from './fields-draft'
import { EmptyRow, Field } from './ui'
import { useCanEdit } from './use-can-edit'

type Draft = {
  id?: string
  slug: string
  nameRu: string
  nameUz: string
  enabled: boolean
  sortOrder: string
  fields: CategoryField[]
  deviceAct: boolean
}
const empty: Draft = {
  slug: '',
  nameRu: '',
  nameUz: '',
  enabled: false,
  sortOrder: '100',
  fields: [],
  deviceAct: false,
}

export function CategoriesPage() {
  const meta = SECTIONS_BY_ID.categories
  const { data = [], isLoading } = useCategories()
  const save = useSaveCategory()
  const editable = useCanEdit('categories')
  const [draft, setDraft] = useState<Draft | null>(null)
  const saved = draft?.id
    ? (data.find((c) => c.id === draft.id)?.fields ?? []).map((f) => f.key)
    : []
  const problems = draft ? fieldsProblems(cleanFields(draft.fields)) : []

  const toggle = (c: Category) =>
    save.mutate({
      id: c.id,
      nameRu: c.nameRu,
      nameUz: c.nameUz,
      enabled: !c.enabled,
      sortOrder: c.sortOrder,
    })

  return (
    <PageShell
      title={meta.title}
      description={meta.description}
      actions={
        editable && (
          <Button onClick={() => setDraft(empty)}>
            <Plus /> Добавить категорию
          </Button>
        )
      }
    >
      <div className='rounded-md border'>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Название (ru)</TableHead>
              <TableHead>Название (uz)</TableHead>
              <TableHead>Код</TableHead>
              <TableHead className='text-right'>Порядок</TableHead>
              <TableHead className='text-right'>Поля карточки</TableHead>
              <TableHead className='text-right'>Товары / лоты</TableHead>
              <TableHead>Видна покупателям</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {!isLoading && data.length === 0 && (
              <EmptyRow cols={8} text='Категорий пока нет' />
            )}
            {data.map((c) => (
              <TableRow key={c.id}>
                <TableCell className='font-medium'>{c.nameRu}</TableCell>
                <TableCell>{c.nameUz}</TableCell>
                <TableCell>
                  <Badge variant='outline' className='font-mono'>
                    {c.slug}
                  </Badge>
                </TableCell>
                <TableCell className='text-right tabular-nums'>
                  {c.sortOrder}
                </TableCell>
                <TableCell className='text-right text-sm'>
                  {c.fields.length || '—'}
                  {c.deviceAct && (
                    <Badge variant='secondary' className='ms-2'>
                      устройство
                    </Badge>
                  )}
                </TableCell>
                <TableCell className='text-right tabular-nums'>
                  {c.products} / {c.lots}
                </TableCell>
                <TableCell>
                  <Switch
                    checked={c.enabled}
                    disabled={save.isPending || !editable}
                    onCheckedChange={() => toggle(c)}
                    aria-label={`Показывать категорию «${c.nameRu}»`}
                  />
                </TableCell>
                <TableCell className='text-right'>
                  {editable && (
                    <Button
                      variant='ghost'
                      size='sm'
                      onClick={() =>
                        setDraft({ ...c, sortOrder: String(c.sortOrder) })
                      }
                    >
                      Изменить
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={draft !== null} onOpenChange={(v) => !v && setDraft(null)}>
        <DialogContent className='max-h-[90svh] overflow-y-auto sm:max-w-2xl'>
          <DialogHeader>
            <DialogTitle>
              {draft?.id ? 'Категория' : 'Новая категория'}
            </DialogTitle>
            <DialogDescription>
              Выключенная категория и её лоты не видны покупателям в Mini App.
            </DialogDescription>
          </DialogHeader>
          {draft && (
            <div className='grid gap-3'>
              <Field label='Название на русском'>
                <Input
                  value={draft.nameRu}
                  onChange={(e) =>
                    setDraft({ ...draft, nameRu: e.target.value })
                  }
                />
              </Field>
              <Field label='Название на узбекском'>
                <Input
                  value={draft.nameUz}
                  onChange={(e) =>
                    setDraft({ ...draft, nameUz: e.target.value })
                  }
                />
              </Field>
              <Field
                label='Код'
                hint='Латиница, цифры и дефис, например laptops. После создания не меняется.'
              >
                <Input
                  value={draft.slug}
                  disabled={Boolean(draft.id)}
                  onChange={(e) =>
                    setDraft({ ...draft, slug: e.target.value.toLowerCase() })
                  }
                  className='font-mono'
                />
              </Field>
              <Field label='Порядок' hint='Меньше — левее в списке категорий.'>
                <Input
                  inputMode='numeric'
                  value={draft.sortOrder}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      sortOrder: e.target.value.replace(/\D/g, ''),
                    })
                  }
                />
              </Field>
              <label className='flex items-center gap-2 text-sm'>
                <Switch
                  checked={draft.enabled}
                  onCheckedChange={(v) => setDraft({ ...draft, enabled: v })}
                />
                Видна покупателям
              </label>
              <label className='flex items-start gap-2 text-sm'>
                <Switch
                  checked={draft.deviceAct}
                  onCheckedChange={(v) => setDraft({ ...draft, deviceAct: v })}
                />
                <span className='grid gap-0.5'>
                  Блок устройства
                  <span className='text-xs text-muted-foreground'>
                    IMEI / серийный (шифруется), батарея, «IMEI сверен» и бейдж
                    «Проверено экспертом» на сайте. Включайте, только если
                    эксперт проверяет товары этой категории.
                  </span>
                </span>
              </label>
              <div className='grid gap-2'>
                <span className='text-sm font-medium'>Поля карточки</span>
                <CategoryFieldsEditor
                  fields={draft.fields}
                  saved={saved}
                  onChange={(fields) => setDraft({ ...draft, fields })}
                />
                {problems.length > 0 && draft.fields.length > 0 && (
                  <p className='text-xs text-destructive' role='alert'>
                    {problems.join('; ')}
                  </p>
                )}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant='outline' onClick={() => setDraft(null)}>
              Отмена
            </Button>
            <Button
              disabled={
                !draft?.nameRu.trim() ||
                !draft?.nameUz.trim() ||
                (!draft?.id && !draft?.slug) ||
                problems.length > 0 ||
                save.isPending
              }
              onClick={() =>
                draft &&
                save.mutate(
                  {
                    id: draft.id,
                    slug: draft.id ? undefined : draft.slug,
                    nameRu: draft.nameRu.trim(),
                    nameUz: draft.nameUz.trim(),
                    enabled: draft.enabled,
                    sortOrder: Number(draft.sortOrder || 0),
                    fields: cleanFields(draft.fields),
                    deviceAct: draft.deviceAct,
                  },
                  { onSuccess: () => setDraft(null) }
                )
              }
            >
              Сохранить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  )
}
