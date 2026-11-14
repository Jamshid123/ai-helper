import { useState } from 'react'
import { SECTIONS_BY_ID } from '@/config/sections'
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
import { EmptyRow, Field } from './ui'

type Draft = {
  id?: string
  slug: string
  nameRu: string
  nameUz: string
  enabled: boolean
  sortOrder: string
}
const empty: Draft = {
  slug: '',
  nameRu: '',
  nameUz: '',
  enabled: false,
  sortOrder: '100',
}

export function CategoriesPage() {
  const meta = SECTIONS_BY_ID.categories
  const { data = [], isLoading } = useCategories()
  const save = useSaveCategory()
  const [draft, setDraft] = useState<Draft | null>(null)

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
        <Button onClick={() => setDraft(empty)}>
          <Plus /> Добавить категорию
        </Button>
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
              <TableHead className='text-right'>Товары / лоты</TableHead>
              <TableHead>Видна покупателям</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {!isLoading && data.length === 0 && (
              <EmptyRow cols={7} text='Категорий пока нет' />
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
                <TableCell className='text-right tabular-nums'>
                  {c.products} / {c.lots}
                </TableCell>
                <TableCell>
                  <Switch
                    checked={c.enabled}
                    disabled={save.isPending}
                    onCheckedChange={() => toggle(c)}
                    aria-label={`Показывать категорию «${c.nameRu}»`}
                  />
                </TableCell>
                <TableCell className='text-right'>
                  <Button
                    variant='ghost'
                    size='sm'
                    onClick={() =>
                      setDraft({ ...c, sortOrder: String(c.sortOrder) })
                    }
                  >
                    Изменить
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={draft !== null} onOpenChange={(v) => !v && setDraft(null)}>
        <DialogContent>
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
