import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { SECTIONS_BY_ID } from '@/config/sections'
import { MoreHorizontal } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { PageShell } from '@/components/layout/page-shell'
import { type Lot, useCancelLot, useLots, usePublishLot } from './api'
import { sum, windowText } from './format'
import { LotDialog } from './lot-dialog'
import { EmptyRow, LotStatusBadge, ReasonDialog } from './ui'
import { useCanEdit } from './use-can-edit'

// черновик правится всегда (сам не открывается), запланированный — до начала торгов
const beforeOpen = (l: Lot) =>
  l.status === 'DRAFT' ||
  (l.status === 'SCHEDULED' && Date.parse(l.opensAt) > Date.now())

export function LotsPage() {
  const meta = SECTIONS_BY_ID.lots
  const { data = [], isLoading } = useLots()
  const publish = usePublishLot()
  const cancel = useCancelLot()
  const canEditLots = useCanEdit('lots')
  const [editing, setEditing] = useState<Lot | null>(null)
  const [cancelling, setCancelling] = useState<Lot | null>(null)
  const [publishing, setPublishing] = useState<Lot | null>(null)
  const [checked, setChecked] = useState(false)
  // повторные торги публикуем через диалог: правило 24 ч, перепроверка товара, минимум участников
  const startPublish = (l: Lot) => {
    if (l.relistOfId) {
      setChecked(false)
      setPublishing(l)
    } else publish.mutate({ id: l.id })
  }

  return (
    <PageShell
      title={meta.title}
      description={meta.description}
      actions={
        <Button variant='outline' asChild>
          <Link to='/products'>Создать из товара</Link>
        </Button>
      }
    >
      <div className='rounded-md border'>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Лот</TableHead>
              <TableHead>Статус</TableHead>
              <TableHead>Торги</TableHead>
              <TableHead className='text-right'>Старт / шаг</TableHead>
              <TableHead className='text-right'>Текущая цена</TableHead>
              <TableHead className='text-right'>Участники</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {!isLoading && data.length === 0 && (
              <EmptyRow
                cols={7}
                text='Лотов пока нет. Создайте лот из товара.'
              />
            )}
            {data.map((l) => {
              const editable =
                beforeOpen(l) && (l.status === 'DRAFT' || l.admittedCount === 0)
              return (
                <TableRow key={l.id}>
                  <TableCell className='font-medium'>
                    {l.title}
                    <span className='block text-xs text-muted-foreground'>
                      {l.categoryName}
                    </span>
                    {l.relistOfId && (
                      <span className='mt-1 block text-xs text-muted-foreground'>
                        <Badge variant='outline'>Повторные торги</Badge>{' '}
                        перенесено допусков: {l.carriedCount ?? 0}
                      </span>
                    )}
                    {l.relistOfId &&
                      l.status === 'DRAFT' &&
                      l.minParticipants !== null &&
                      (l.carriedCount ?? 0) < l.minParticipants && (
                        <span className='mt-1 block text-xs text-amber-600 dark:text-amber-400'>
                          Перенесённых меньше минимума ({l.carriedCount ?? 0} из{' '}
                          {l.minParticipants}) — без новых участников торги отменятся
                        </span>
                      )}
                  </TableCell>
                  <TableCell>
                    <LotStatusBadge status={l.status} />
                  </TableCell>
                  <TableCell className='text-sm whitespace-nowrap'>
                    {windowText(l.opensAt, l.closesAt)}
                  </TableCell>
                  <TableCell className='text-right text-sm whitespace-nowrap tabular-nums'>
                    {sum(l.startPrice)}
                    <span className='block text-xs text-muted-foreground'>
                      шаг {sum(l.step)}
                    </span>
                  </TableCell>
                  <TableCell className='text-right tabular-nums'>
                    {sum(l.currentPrice)}
                  </TableCell>
                  <TableCell className='text-right tabular-nums'>
                    {l.admittedCount}
                  </TableCell>
                  <TableCell className='text-right whitespace-nowrap'>
                    <div className='flex items-center justify-end gap-1'>
                      {canEditLots && l.status === 'DRAFT' && (
                        <Button
                          size='sm'
                          disabled={publish.isPending}
                          onClick={() => startPublish(l)}
                        >
                          Опубликовать
                        </Button>
                      )}
                      {canEditLots && beforeOpen(l) && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant='ghost'
                              size='icon'
                              aria-label={`Действия с лотом «${l.title}»`}
                            >
                              <MoreHorizontal />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align='end'>
                            <DropdownMenuItem
                              disabled={!editable}
                              onSelect={() => setEditing(l)}
                            >
                              {editable
                                ? 'Изменить'
                                : 'Изменить (есть участники)'}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              variant='destructive'
                              onSelect={() => setCancelling(l)}
                            >
                              Отменить лот
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>
      <p className='mt-3 text-xs text-muted-foreground'>
        После открытия торгов лот, предложения цены и победитель не меняются
        (ТЗ). Лот с участниками до начала можно только отменить — участникам
        вернётся 100%.
      </p>

      {editing && (
        <LotDialog
          open
          lot={editing}
          onOpenChange={(v) => !v && setEditing(null)}
        />
      )}
      <ReasonDialog
        open={cancelling !== null}
        onOpenChange={(v) => !v && setCancelling(null)}
        title='Отменить лот?'
        description={
          cancelling
            ? `«${cancelling.title}». Допуски участников (${cancelling.admittedCount}) снимутся, товар вернётся на склад. Если у кого-то старый оплаченный взнос — он вернётся.`
            : ''
        }
        confirm='Отменить лот'
        destructive
        pending={cancel.isPending}
        onConfirm={(reason) =>
          cancelling &&
          cancel.mutate(
            { id: cancelling.id, reason },
            { onSuccess: () => setCancelling(null) }
          )
        }
      />
      <Dialog open={publishing !== null} onOpenChange={(v) => !v && setPublishing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Опубликовать повторные торги</DialogTitle>
            <DialogDescription>
              {publishing
                ? `«${publishing.title}», начало ${windowText(publishing.opensAt, publishing.closesAt)}. Перенесённые участники (${publishing.carriedCount ?? 0}) получат приглашение и должны подтвердить участие до 2 часов до старта — иначе места освободятся для новых.`
                : ''}
            </DialogDescription>
          </DialogHeader>
          <ul className='list-disc space-y-1 pl-5 text-sm text-muted-foreground'>
            <li>Начало — не раньше чем через 24 часа после публикации, чтобы участники успели узнать.</li>
            <li>Победителю, который не выкупил лот, участие в торгах этого товара закрыто.</li>
          </ul>
          {publishing?.needsRelistCheck && (
            <label className='flex items-start gap-2 text-sm'>
              <Checkbox
                checked={checked}
                onCheckedChange={(v) => setChecked(v === true)}
                className='mt-0.5'
              />
              <span>
                Товар не забрали после оплаты 10% — я перепроверил его по акту, описание и фото
                соответствуют.
              </span>
            </label>
          )}
          <DialogFooter>
            <Button variant='outline' onClick={() => setPublishing(null)}>
              Отмена
            </Button>
            <Button
              disabled={publish.isPending || (Boolean(publishing?.needsRelistCheck) && !checked)}
              onClick={() =>
                publishing &&
                publish.mutate(
                  { id: publishing.id, inspectionConfirmed: checked },
                  { onSuccess: () => setPublishing(null) }
                )
              }
            >
              Опубликовать
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  )
}
