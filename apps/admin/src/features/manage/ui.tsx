import { Children, cloneElement, isValidElement, useId, useState } from 'react'
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
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import type { LotStatus, ProductStatus } from './api'

/** Подпись поля, связанная с первым элементом управления (htmlFor/id) — для скринридеров и клика по подписи. */
export function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  const id = useId()
  const items = Children.toArray(children)
  const [first, ...rest] = items
  const control = isValidElement<{ id?: string }>(first)
    ? cloneElement(first, { id: first.props.id ?? id })
    : first
  const forId = isValidElement<{ id?: string }>(first)
    ? (first.props.id ?? id)
    : undefined
  return (
    <div className='grid gap-1.5'>
      <Label htmlFor={forId}>{label}</Label>
      {control}
      {rest}
      {hint && <p className='text-xs text-muted-foreground'>{hint}</p>}
    </div>
  )
}

/** Действие, которое требует причины (ТЗ: решения и снятия — только с причиной, в журнал). */
export function ReasonDialog({
  open,
  onOpenChange,
  title,
  description,
  confirm,
  destructive,
  pending,
  onConfirm,
  children,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  title: string
  description: string
  confirm: string
  destructive?: boolean
  pending?: boolean
  onConfirm: (reason: string) => void
  children?: React.ReactNode
}) {
  const [reason, setReason] = useState('')
  const valid = reason.trim().length >= 3
  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) setReason('')
        onOpenChange(v)
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className='grid gap-3'>
          {children}
          <Field label='Причина' hint='Обязательно. Попадёт в журнал аудита.'>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              maxLength={500}
            />
          </Field>
        </div>
        <DialogFooter>
          <Button variant='outline' onClick={() => onOpenChange(false)}>
            Отмена
          </Button>
          <Button
            variant={destructive ? 'destructive' : 'default'}
            disabled={!valid || pending}
            onClick={() => onConfirm(reason.trim())}
          >
            {confirm}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

const LOT_STATUS: Record<
  LotStatus,
  { text: string; variant: 'default' | 'secondary' | 'outline' | 'destructive' }
> = {
  DRAFT: { text: 'Черновик', variant: 'outline' },
  SCHEDULED: { text: 'Запланирован', variant: 'secondary' },
  LIVE: { text: 'Идут торги', variant: 'default' },
  CLOSED_SOLD: { text: 'Завершён', variant: 'secondary' },
  CLOSED_UNSOLD: { text: 'Без продажи', variant: 'outline' },
  UNDER_REVIEW: { text: 'На проверке', variant: 'outline' },
  CANCELLED: { text: 'Отменён', variant: 'destructive' },
}
export const LotStatusBadge = ({ status }: { status: LotStatus }) => (
  <Badge variant={LOT_STATUS[status].variant}>{LOT_STATUS[status].text}</Badge>
)

const PRODUCT_STATUS: Record<ProductStatus, string> = {
  AVAILABLE: 'На складе',
  IN_LOT: 'В лоте',
  SOLD: 'Продан',
  ARCHIVED: 'Архив',
}
export const ProductStatusBadge = ({ status }: { status: ProductStatus }) => (
  <Badge variant={status === 'AVAILABLE' ? 'secondary' : 'outline'}>
    {PRODUCT_STATUS[status]}
  </Badge>
)

export function EmptyRow({ cols, text }: { cols: number; text: string }) {
  return (
    <tr>
      <td
        colSpan={cols}
        className='py-10 text-center text-sm text-muted-foreground'
      >
        {text}
      </td>
    </tr>
  )
}
