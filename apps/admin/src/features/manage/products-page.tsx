import { useState } from 'react'
import { SECTIONS_BY_ID } from '@/config/sections'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { PageShell } from '@/components/layout/page-shell'
import { type Product, useCategories, useProducts, useSaveProduct } from './api'
import { conditionText, digits, sum } from './format'
import { LotDialog } from './lot-dialog'
import { EmptyRow, Field, ProductStatusBadge } from './ui'

type Draft = {
  id?: string
  categoryId: string
  title: string
  condition: 'NEW' | 'USED'
  description: string
  summary: string
  battery: string
  imeiChecked: boolean
  kit: string
  defects: string
  imei: string
  inventoryNo: string
  costPrice: string
  imeiLast4?: string | null
}
const lines = (s: string) =>
  s
    .split('\n')
    .map((x) => x.trim())
    .filter(Boolean)

function toDraft(p: Product): Draft {
  return {
    id: p.id,
    categoryId: p.categoryId,
    title: p.title,
    condition: p.condition,
    description: p.description,
    summary: p.inspection.summary,
    battery: p.inspection.battery === null ? '' : String(p.inspection.battery),
    imeiChecked: p.inspection.imeiChecked,
    kit: p.inspection.kit.join('\n'),
    defects: p.inspection.defects.join('\n'),
    imei: '',
    inventoryNo: p.inventoryNo ?? '',
    costPrice: p.costPrice ?? '',
    imeiLast4: p.imeiLast4,
  }
}

export function ProductsPage() {
  const meta = SECTIONS_BY_ID.products
  const { data = [], isLoading } = useProducts()
  const { data: categories = [] } = useCategories()
  const save = useSaveProduct()
  const [draft, setDraft] = useState<Draft | null>(null)
  const [lotFor, setLotFor] = useState<Product | null>(null)

  const blank = (): Draft => ({
    categoryId:
      categories.find((c) => c.slug === 'phones')?.id ??
      categories[0]?.id ??
      '',
    title: '',
    condition: 'USED',
    description: '',
    summary: '',
    battery: '',
    imeiChecked: false,
    kit: '',
    defects: '',
    imei: '',
    inventoryNo: '',
    costPrice: '',
  })

  const submit = () => {
    if (!draft) return
    save.mutate(
      {
        id: draft.id,
        categoryId: draft.categoryId,
        title: draft.title.trim(),
        condition: draft.condition,
        description: draft.description.trim(),
        inspection: {
          summary: draft.summary.trim(),
          battery: draft.battery ? Math.min(100, Number(draft.battery)) : null,
          imeiChecked: draft.imeiChecked,
          kit: lines(draft.kit),
          defects: lines(draft.defects),
        },
        ...(draft.imei.trim() && { imei: draft.imei.trim() }),
        ...(draft.inventoryNo.trim() && {
          inventoryNo: draft.inventoryNo.trim(),
        }),
        ...(draft.costPrice && { costPrice: draft.costPrice }),
      },
      { onSuccess: () => setDraft(null) }
    )
  }

  return (
    <PageShell
      title={meta.title}
      description={meta.description}
      actions={
        <Button onClick={() => setDraft(blank())} disabled={!categories.length}>
          <Plus /> Добавить товар
        </Button>
      }
    >
      <div className='rounded-md border'>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Товар</TableHead>
              <TableHead>Категория</TableHead>
              <TableHead>Состояние</TableHead>
              <TableHead>IMEI</TableHead>
              <TableHead className='text-right'>Себестоимость</TableHead>
              <TableHead>Статус</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {!isLoading && data.length === 0 && (
              <EmptyRow cols={7} text='Товаров пока нет — добавьте первый' />
            )}
            {data.map((p) => (
              <TableRow key={p.id}>
                <TableCell className='font-medium'>
                  {p.title}
                  {p.inventoryNo && (
                    <span className='block text-xs text-muted-foreground'>
                      {p.inventoryNo}
                    </span>
                  )}
                </TableCell>
                <TableCell>{p.category.name}</TableCell>
                <TableCell>{conditionText(p.condition)}</TableCell>
                <TableCell className='font-mono text-xs'>
                  {p.imeiLast4 ? `•••• ${p.imeiLast4}` : '—'}
                </TableCell>
                <TableCell className='text-right tabular-nums'>
                  {sum(p.costPrice)}
                </TableCell>
                <TableCell>
                  <ProductStatusBadge status={p.status} />
                </TableCell>
                <TableCell className='space-x-1 text-right whitespace-nowrap'>
                  {p.status === 'AVAILABLE' && (
                    <Button size='sm' onClick={() => setLotFor(p)}>
                      Создать лот
                    </Button>
                  )}
                  <Button
                    variant='ghost'
                    size='sm'
                    onClick={() => setDraft(toDraft(p))}
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
        <DialogContent className='max-h-[90svh] overflow-y-auto sm:max-w-xl'>
          <DialogHeader>
            <DialogTitle>{draft?.id ? 'Товар' : 'Новый товар'}</DialogTitle>
            <DialogDescription>
              Карточка и акт проверки. Покупатели увидят их в лоте; полный IMEI
              хранится зашифрованным.
            </DialogDescription>
          </DialogHeader>
          {draft && (
            <div className='grid gap-3'>
              <Field label='Название'>
                <Input
                  placeholder='iPhone 14 Pro, 256 ГБ'
                  value={draft.title}
                  onChange={(e) =>
                    setDraft({ ...draft, title: e.target.value })
                  }
                />
              </Field>
              <div className='grid grid-cols-2 gap-3'>
                <Field label='Категория'>
                  <Select
                    value={draft.categoryId}
                    onValueChange={(v) => setDraft({ ...draft, categoryId: v })}
                  >
                    <SelectTrigger className='w-full' aria-label='Категория'>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {categories.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.nameRu}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label='Состояние'>
                  <Select
                    value={draft.condition}
                    onValueChange={(v) =>
                      setDraft({ ...draft, condition: v as 'NEW' | 'USED' })
                    }
                  >
                    <SelectTrigger className='w-full' aria-label='Состояние'>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value='NEW'>Новый</SelectItem>
                      <SelectItem value='USED'>Б/у</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
              </div>
              <Field label='Описание'>
                <Textarea
                  rows={2}
                  value={draft.description}
                  onChange={(e) =>
                    setDraft({ ...draft, description: e.target.value })
                  }
                />
              </Field>
              <Field label='Итог проверки'>
                <Textarea
                  rows={2}
                  placeholder='Корпус без сколов, Face ID работает'
                  value={draft.summary}
                  onChange={(e) =>
                    setDraft({ ...draft, summary: e.target.value })
                  }
                />
              </Field>
              <div className='grid grid-cols-2 gap-3'>
                <Field label='Батарея, %' hint='Пусто — для новых'>
                  <Input
                    inputMode='numeric'
                    value={draft.battery}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        battery: digits(e.target.value).slice(0, 3),
                      })
                    }
                  />
                </Field>
                <label className='flex items-center gap-2 self-end pb-2 text-sm'>
                  <Checkbox
                    checked={draft.imeiChecked}
                    onCheckedChange={(v) =>
                      setDraft({ ...draft, imeiChecked: v === true })
                    }
                  />
                  IMEI сверен
                </label>
              </div>
              <div className='grid grid-cols-2 gap-3'>
                <Field label='Комплект' hint='По одному в строке'>
                  <Textarea
                    rows={3}
                    value={draft.kit}
                    onChange={(e) =>
                      setDraft({ ...draft, kit: e.target.value })
                    }
                  />
                </Field>
                <Field label='Дефекты' hint='По одному в строке'>
                  <Textarea
                    rows={3}
                    value={draft.defects}
                    onChange={(e) =>
                      setDraft({ ...draft, defects: e.target.value })
                    }
                  />
                </Field>
              </div>
              <div className='grid grid-cols-3 gap-3'>
                <Field
                  label='IMEI / серийный'
                  hint={
                    draft.imeiLast4
                      ? `Сейчас: •••• ${draft.imeiLast4}`
                      : 'Шифруется'
                  }
                >
                  <Input
                    value={draft.imei}
                    autoComplete='off'
                    onChange={(e) =>
                      setDraft({ ...draft, imei: e.target.value })
                    }
                  />
                </Field>
                <Field label='Инв. номер'>
                  <Input
                    value={draft.inventoryNo}
                    onChange={(e) =>
                      setDraft({ ...draft, inventoryNo: e.target.value })
                    }
                  />
                </Field>
                <Field label='Себестоимость' hint='Старт лота не ниже'>
                  <Input
                    inputMode='numeric'
                    value={draft.costPrice}
                    onChange={(e) =>
                      setDraft({ ...draft, costPrice: digits(e.target.value) })
                    }
                  />
                </Field>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant='outline' onClick={() => setDraft(null)}>
              Отмена
            </Button>
            <Button
              disabled={
                !draft?.title.trim() || !draft?.categoryId || save.isPending
              }
              onClick={submit}
            >
              Сохранить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {lotFor && (
        <LotDialog
          open
          product={lotFor}
          onOpenChange={(v) => !v && setLotFor(null)}
        />
      )}
    </PageShell>
  )
}
