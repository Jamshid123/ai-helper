import { useState } from 'react'
import { cn } from '@/lib/utils'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import {
  type Lot,
  type Product,
  useCreateLot,
  useProducts,
  useUpdateLot,
} from './api'
import { dateTime, digits, sum, tashkentLocal, toTashkentLocal } from './format'
import { Field } from './ui'

type Props = {
  open: boolean
  onOpenChange: (v: boolean) => void
  product?: Product
  lot?: Lot
}

/** Продолжительность торгов, минуты. */
const DURATIONS = [
  [15, '15 мин'],
  [30, '30 мин'],
  [60, '1 ч'],
  [120, '2 ч'],
  [180, '3 ч'],
  [540, '9 ч'],
  [1440, '1 день'],
  [4320, '3 дня'],
] as const
/** Ожидание следующего предложения, секунды (0 — без досрочного завершения). */
const TIMEOUTS = [
  [0, 'Без ожидания'],
  [60, '1 минута'],
  [120, '2 минуты'],
  [180, '3 минуты'],
  [300, '5 минут'],
  [600, '10 минут'],
  [900, '15 минут'],
  [1800, '30 минут'],
] as const

/** Ближайший час через 1 час (Ташкент) — разумное время начала по умолчанию. */
function defaultStart(): string {
  const d = new Date(Date.now() + 2 * 3_600_000)
  d.setUTCMinutes(0, 0, 0)
  return toTashkentLocal(d.toISOString())
}
const intOrNull = (v: string) => (digits(v) ? Number(digits(v)) : null)

/**
 * Торги из товара или правка черновика/запланированного лота (решение 14.11.2026: любой день и время,
 * продолжительность, минимум и максимум участников, ожидание следующего предложения).
 */
export function LotDialog({ open, onOpenChange, product: given, lot }: Props) {
  const create = useCreateLot()
  const update = useUpdateLot()
  const { data: available = [] } = useProducts('AVAILABLE')
  const [productId, setProductId] = useState(given?.id ?? '')
  const product = given ?? available.find((p) => p.id === productId)
  const initialMinutes = lot
    ? Math.round((Date.parse(lot.closesAt) - Date.parse(lot.opensAt)) / 60_000)
    : 180
  const [v, setV] = useState({
    title: lot?.title ?? given?.title ?? '',
    description: lot?.description ?? given?.description ?? '',
    startPrice: lot?.startPrice ?? given?.costPrice ?? '',
    step: lot?.step ?? '100000',
    fee: lot?.fee ?? '12000',
    start: lot ? toTashkentLocal(lot.opensAt) : defaultStart(),
    minutes: String(initialMinutes),
    minParticipants:
      lot?.minParticipants != null ? String(lot.minParticipants) : '',
    maxParticipants:
      lot?.maxParticipants != null ? String(lot.maxParticipants) : '',
    timeout: String(lot?.bidTimeoutSec ?? 0),
  })
  // смена товара в «Расписании» подставляет его название, описание и себестоимость
  const pick = (id: string) => {
    const p = available.find((x) => x.id === id)
    setProductId(id)
    if (p)
      setV((s) => ({
        ...s,
        title: p.title,
        description: p.description,
        startPrice: p.costPrice ?? s.startPrice,
      }))
  }

  const minutes = Number(v.minutes || 0)
  const opensAt = v.start ? tashkentLocal(v.start) : ''
  const closesAt = opensAt
    ? new Date(Date.parse(opensAt) + minutes * 60_000).toISOString()
    : ''
  const min = intOrNull(v.minParticipants)
  const max = intOrNull(v.maxParticipants)
  const pending = create.isPending || update.isPending
  const problems = [
    !lot && !product && 'Выберите товар',
    !v.title.trim() && 'Название',
    !v.startPrice && 'Стартовая цена',
    (minutes < 5 || minutes > 20160) &&
      'Продолжительность — от 5 минут до 14 дней',
    min !== null &&
      max !== null &&
      min > max &&
      'Минимум участников больше максимума',
  ].filter(Boolean) as string[]

  const submit = () => {
    if (problems.length) return
    const body = {
      title: v.title.trim(),
      description: v.description.trim(),
      startPrice: v.startPrice,
      step: v.step,
      fee: v.fee || '0',
      opensAt: new Date(opensAt).toISOString(),
      closesAt,
      minParticipants: min,
      maxParticipants: max,
      bidTimeoutSec: Number(v.timeout) || null,
    }
    const done = { onSuccess: () => onOpenChange(false) }
    if (lot) update.mutate({ id: lot.id, ...body }, done)
    else if (product) create.mutate({ productId: product.id, ...body }, done)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='max-h-[90svh] overflow-y-auto sm:max-w-xl'>
        <DialogHeader>
          <DialogTitle>{lot ? 'Торги' : 'Новые торги'}</DialogTitle>
          <DialogDescription>
            {lot
              ? 'Править можно до начала торгов и пока нет участников.'
              : 'Создаётся черновик — покупатели увидят торги после публикации.'}
          </DialogDescription>
        </DialogHeader>
        <div className='grid gap-3'>
          {!lot && !given && (
            <div className='grid gap-1.5'>
              <span className='text-sm font-medium'>Товар</span>
              <Select value={productId} onValueChange={pick}>
                <SelectTrigger className='w-full' aria-label='Товар'>
                  <SelectValue
                    placeholder={
                      available.length
                        ? 'Выберите товар со склада'
                        : 'На складе нет свободных товаров'
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {available.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.title}
                      {p.costPrice
                        ? ` · себестоимость ${sum(p.costPrice)}`
                        : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <Field label='Название в каталоге'>
            <Input
              value={v.title}
              onChange={(e) => setV({ ...v, title: e.target.value })}
            />
          </Field>
          <Field label='Описание'>
            <Textarea
              rows={2}
              value={v.description}
              onChange={(e) => setV({ ...v, description: e.target.value })}
            />
          </Field>

          <div className='grid grid-cols-2 gap-3'>
            <Field label='Начало (Ташкент)'>
              <Input
                type='datetime-local'
                value={v.start}
                onChange={(e) => setV({ ...v, start: e.target.value })}
              />
            </Field>
            <Field
              label='Продолжительность, минут'
              hint={closesAt ? `Окончание: ${dateTime(closesAt)}` : undefined}
            >
              <Input
                inputMode='numeric'
                value={v.minutes}
                onChange={(e) =>
                  setV({ ...v, minutes: digits(e.target.value) })
                }
              />
            </Field>
          </div>
          <div
            className='flex flex-wrap gap-1.5'
            role='group'
            aria-label='Быстрый выбор продолжительности'
          >
            {DURATIONS.map(([m, label]) => (
              <button
                key={m}
                type='button'
                onClick={() => setV({ ...v, minutes: String(m) })}
                className={cn(
                  'rounded-full border px-2.5 py-0.5 text-xs',
                  minutes === m
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'text-muted-foreground'
                )}
              >
                {label}
              </button>
            ))}
          </div>

          <div className='grid grid-cols-3 gap-3'>
            <Field
              label='Мин. участников'
              hint='Меньше к началу — отмена с возвратом'
            >
              <Input
                inputMode='numeric'
                placeholder='Без минимума'
                value={v.minParticipants}
                onChange={(e) =>
                  setV({ ...v, minParticipants: digits(e.target.value) })
                }
              />
            </Field>
            <Field label='Макс. участников' hint='Мест нет — допуск закрыт'>
              <Input
                inputMode='numeric'
                placeholder='Без лимита'
                value={v.maxParticipants}
                onChange={(e) =>
                  setV({ ...v, maxParticipants: digits(e.target.value) })
                }
              />
            </Field>
            <div className='grid gap-1.5 self-start'>
              <span className='text-sm font-medium'>Ожидание ставки</span>
              <Select
                value={v.timeout}
                onValueChange={(timeout) => setV({ ...v, timeout })}
              >
                <SelectTrigger
                  className='w-full'
                  aria-label='Ожидание следующей ставки'
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIMEOUTS.map(([s, label]) => (
                    <SelectItem key={s} value={String(s)}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className='text-xs text-muted-foreground'>
                Нет новой ставки — торги завершаются раньше
              </p>
            </div>
          </div>

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
          {problems.length > 0 && (
            <p className='text-xs text-muted-foreground'>
              Заполните: {problems.join(', ')}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant='outline' onClick={() => onOpenChange(false)}>
            Отмена
          </Button>
          <Button disabled={problems.length > 0 || pending} onClick={submit}>
            {lot ? 'Сохранить' : 'Создать черновик'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
