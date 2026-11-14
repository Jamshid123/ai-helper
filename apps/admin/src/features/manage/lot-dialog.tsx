import { useState } from 'react'
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
import { Textarea } from '@/components/ui/textarea'
import { type Lot, type Product, useCreateLot, useUpdateLot } from './api'
import {
  digits,
  fridaySlot,
  isFriday,
  nextFriday,
  sum,
  tashkentLocal,
  toTashkentLocal,
} from './format'
import { Field } from './ui'

type Props = { open: boolean; onOpenChange: (v: boolean) => void } & (
  { product: Product; lot?: undefined } | { lot: Lot; product?: undefined }
)

/**
 * Лот из товара или правка черновика/запланированного лота.
 * Время: на проде — пятница 09:00–18:00 по Ташкенту; «своё время» сервер примет только на демо-стенде.
 */
export function LotDialog(props: Props) {
  const { open, onOpenChange, product, lot } = props
  const create = useCreateLot()
  const update = useUpdateLot()
  const friday0 = lot ? toTashkentLocal(lot.opensAt).slice(0, 10) : nextFriday()
  const customInitially = lot
    ? !(isFriday(friday0) && toTashkentLocal(lot.opensAt).endsWith('09:00'))
    : false
  const [v, setV] = useState({
    title: lot?.title ?? product?.title ?? '',
    description: lot?.description ?? product?.description ?? '',
    startPrice: lot?.startPrice ?? product?.costPrice ?? '',
    step: lot?.step ?? '100000',
    fee: lot?.fee ?? '12000',
    friday: friday0,
    custom: customInitially,
    opensAt: lot ? toTashkentLocal(lot.opensAt) : '',
    closesAt: lot ? toTashkentLocal(lot.closesAt) : '',
  })
  const pending = create.isPending || update.isPending
  const window = v.custom
    ? v.opensAt && v.closesAt
      ? {
          opensAt: tashkentLocal(v.opensAt),
          closesAt: tashkentLocal(v.closesAt),
        }
      : null
    : isFriday(v.friday)
      ? fridaySlot(v.friday)
      : null
  const valid = Boolean(v.title.trim() && v.startPrice && v.step && window)

  const submit = () => {
    if (!window) return
    const body = {
      title: v.title.trim(),
      description: v.description.trim(),
      startPrice: v.startPrice,
      step: v.step,
      fee: v.fee || '0',
      ...window,
    }
    const done = { onSuccess: () => onOpenChange(false) }
    if (lot) update.mutate({ id: lot.id, ...body }, done)
    else if (product) create.mutate({ productId: product.id, ...body }, done)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='max-h-[90svh] overflow-y-auto sm:max-w-lg'>
        <DialogHeader>
          <DialogTitle>{lot ? 'Лот' : 'Новый лот'}</DialogTitle>
          <DialogDescription>
            {lot
              ? 'Править можно до открытия торгов и пока нет участников.'
              : `Из товара «${product?.title}». Создаётся черновик — покупатели увидят лот после публикации.`}
          </DialogDescription>
        </DialogHeader>
        <div className='grid gap-3'>
          <Field label='Название в каталоге'>
            <Input
              value={v.title}
              onChange={(e) => setV({ ...v, title: e.target.value })}
            />
          </Field>
          <Field label='Описание'>
            <Textarea
              rows={3}
              value={v.description}
              onChange={(e) => setV({ ...v, description: e.target.value })}
            />
          </Field>
          <div className='grid grid-cols-3 gap-3'>
            <Field
              label='Старт, сум'
              hint={
                product?.costPrice
                  ? `Не ниже ${sum(product.costPrice)}`
                  : undefined
              }
            >
              <Input
                inputMode='numeric'
                value={v.startPrice}
                onChange={(e) =>
                  setV({ ...v, startPrice: digits(e.target.value) })
                }
              />
            </Field>
            <Field label='Шаг, сум' hint='Не меньше 100 000'>
              <Input
                inputMode='numeric'
                value={v.step}
                onChange={(e) => setV({ ...v, step: digits(e.target.value) })}
              />
            </Field>
            <Field label='Взнос, сум'>
              <Input
                inputMode='numeric'
                value={v.fee}
                onChange={(e) => setV({ ...v, fee: digits(e.target.value) })}
              />
            </Field>
          </div>
          {!v.custom ? (
            <Field
              label='Пятница торгов'
              hint='Торги с 09:00 до 18:00 по Ташкенту.'
            >
              <Input
                type='date'
                value={v.friday}
                onChange={(e) => setV({ ...v, friday: e.target.value })}
              />
              {v.friday && !isFriday(v.friday) && (
                <p className='text-xs text-destructive'>Выберите пятницу</p>
              )}
            </Field>
          ) : (
            <div className='grid grid-cols-2 gap-3'>
              <Field label='Начало (Ташкент)'>
                <Input
                  type='datetime-local'
                  value={v.opensAt}
                  onChange={(e) => setV({ ...v, opensAt: e.target.value })}
                />
              </Field>
              <Field label='Окончание (Ташкент)'>
                <Input
                  type='datetime-local'
                  value={v.closesAt}
                  onChange={(e) => setV({ ...v, closesAt: e.target.value })}
                />
              </Field>
            </div>
          )}
          <label className='flex items-center gap-2 text-sm text-muted-foreground'>
            <Switch
              checked={v.custom}
              onCheckedChange={(c) => setV({ ...v, custom: c })}
            />
            Своё время (только для тестового стенда)
          </label>
        </div>
        <DialogFooter>
          <Button variant='outline' onClick={() => onOpenChange(false)}>
            Отмена
          </Button>
          <Button disabled={!valid || pending} onClick={submit}>
            {lot ? 'Сохранить' : 'Создать черновик'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
