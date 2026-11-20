import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { SECTIONS_BY_ID } from '@/config/sections'
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { PageShell } from '@/components/layout/page-shell'
import {
  type Buyout,
  type BuyoutFilter,
  useBuyouts,
  useDecidePrepayment,
  useFinanceBuyouts,
  useIssue,
  useRemainderOnSite,
} from './api'
import { dateTime, digits, sum } from './format'
import { EmptyRow, Field, ReasonDialog } from './ui'
import { useCanEdit } from './use-can-edit'

type BadgeVariant = 'default' | 'secondary' | 'outline' | 'destructive'
const STATUS: Record<string, { text: string; variant: BadgeVariant }> = {
  AWAITING_PREPAYMENT: { text: 'Ждём 10%', variant: 'outline' },
  AWAITING_PICKUP: { text: 'Ждёт выдачи', variant: 'default' },
  COMPLETED: { text: 'Выдан', variant: 'secondary' },
  EXPIRED: { text: 'Аннулирован', variant: 'destructive' },
  CANCELLED: { text: 'Отменён', variant: 'outline' },
  // выкупы по старой схеме (подтверждение → 30%), созданные до 16.11.2026
  AWAITING_CONFIRMATION: { text: 'Старая схема', variant: 'outline' },
  AWAITING_REMAINDER: { text: 'Старая схема', variant: 'outline' },
}
const statusOf = (s: string) =>
  STATUS[s] ?? { text: s, variant: 'outline' as const }

const FILTERS: { id: BuyoutFilter; text: string }[] = [
  { id: 'active', text: 'В работе' },
  { id: 'all', text: 'Все' },
]

/**
 * Выдача (ТЗ «Админка»): победитель оплатил 10% → у него код и 24 часа. Сотрудник принимает остаток
 * на месте (если не оплачен на сайте), сверяет товар и выдаёт по коду. Аннулирование и повторные торги
 * делает сервер по сроку; править победителя здесь нельзя.
 */
export function FulfillmentPage({
  mode = 'fulfillment',
}: {
  /** finance — «Финансы / Решения по 10%» (решение владельца 20.11.2026): те же выкупы, только решения по 10%. */
  mode?: 'fulfillment' | 'finance'
}) {
  const finance = mode === 'finance'
  const meta = SECTIONS_BY_ID[mode]
  const [filter, setFilter] = useState<BuyoutFilter>('active')
  const fulfillment = useBuyouts(filter, !finance)
  const decisions = useFinanceBuyouts(finance)
  const { data = [], isFetching } = finance ? decisions : fulfillment
  const canIssue = useCanEdit('fulfillment') && !finance
  const canDecide = useCanEdit('finance') && finance
  const [issueFor, setIssueFor] = useState<Buyout | null>(null)
  const [decideFor, setDecideFor] = useState<{
    b: Buyout
    decision: 'REFUNDED' | 'RETAINED'
  } | null>(null)
  const onsite = useRemainderOnSite()
  const decide = useDecidePrepayment()

  return (
    <PageShell title={meta.title} description={meta.description}>
      {!finance && (
        <div className='mb-4 flex flex-wrap gap-2' role='tablist'>
          {FILTERS.map((f) => (
            <Button
              key={f.id}
              role='tab'
              aria-selected={filter === f.id}
              size='sm'
              variant={filter === f.id ? 'default' : 'outline'}
              onClick={() => setFilter(f.id)}
            >
              {f.text}
            </Button>
          ))}
        </div>
      )}

      <div className='rounded-md border'>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Лот и покупатель</TableHead>
              <TableHead>Статус</TableHead>
              <TableHead className='text-right'>Цена / 10% / остаток</TableHead>
              <TableHead>Срок</TableHead>
              <TableHead className='text-right'>Действия</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {!isFetching && data.length === 0 && (
              <EmptyRow
                cols={5}
                text={
                  finance
                    ? 'Решений по 10% сейчас не ждёт ни один выкуп'
                    : 'Сейчас ничего нет'
                }
              />
            )}
            {data.map((b) => (
              <TableRow key={b.id}>
                <TableCell className='align-top'>
                  <div className='font-medium'>{b.lotTitle}</div>
                  <div className='text-xs text-muted-foreground'>
                    {b.buyer.name}
                    {b.buyer.phone ? ` · ${b.buyer.phone}` : ''}
                  </div>
                </TableCell>
                <TableCell className='align-top'>
                  <Badge variant={statusOf(b.status).variant}>
                    {statusOf(b.status).text}
                  </Badge>
                  {b.status === 'EXPIRED' && (
                    <div className='mt-1 text-xs text-muted-foreground'>
                      {b.expiredReason === 'PICKUP_MISSED'
                        ? 'Не забрал за 24 ч'
                        : 'Не оплатил 10% за 15 мин'}
                      {b.relist && (
                        <>
                          {' · '}
                          <Link to='/lots' className='underline'>
                            повторные торги (черновик)
                          </Link>
                        </>
                      )}
                    </div>
                  )}
                  {b.prepaymentDecision &&
                    b.prepaymentDecision !== 'PENDING' && (
                      <div className='mt-1 text-xs text-muted-foreground'>
                        10%:{' '}
                        {b.prepaymentDecision === 'REFUNDED'
                          ? 'возвращены'
                          : 'удержаны'}
                      </div>
                    )}
                </TableCell>
                <TableCell className='text-right align-top tabular-nums'>
                  <div>{sum(b.amount)}</div>
                  <div className='text-xs text-muted-foreground'>
                    {sum(b.prepaymentAmount)} · {sum(b.remainderAmount)}
                  </div>
                  {b.remainderPaid && (
                    <div className='text-xs text-emerald-600 dark:text-emerald-400'>
                      остаток оплачен{' '}
                      {b.remainderPaid === 'onsite' ? 'на месте' : 'на сайте'}
                    </div>
                  )}
                </TableCell>
                <TableCell className='align-top text-sm'>
                  {b.status === 'AWAITING_PREPAYMENT' &&
                    `10% до ${dateTime(b.prepaymentDeadline)}`}
                  {b.status === 'AWAITING_PICKUP' &&
                    `забрать до ${dateTime(b.remainderDeadline)}`}
                  {b.status === 'COMPLETED' &&
                    `выдан ${dateTime(b.completedAt)}`}
                </TableCell>
                <TableCell className='align-top'>
                  <div className='flex flex-wrap justify-end gap-2'>
                    {b.status === 'AWAITING_PICKUP' && canIssue && (
                      <>
                        {!b.remainderPaid && (
                          <>
                            <Button
                              size='sm'
                              variant='outline'
                              disabled={onsite.isPending}
                              onClick={() =>
                                onsite.mutate({ id: b.id, method: 'cash' })
                              }
                            >
                              Остаток наличными
                            </Button>
                            <Button
                              size='sm'
                              variant='outline'
                              disabled={onsite.isPending}
                              onClick={() =>
                                onsite.mutate({ id: b.id, method: 'card' })
                              }
                            >
                              Остаток картой
                            </Button>
                          </>
                        )}
                        <Button
                          size='sm'
                          disabled={!b.remainderPaid}
                          title={
                            b.remainderPaid
                              ? undefined
                              : 'Сначала примите остаток'
                          }
                          onClick={() => setIssueFor(b)}
                        >
                          Выдать по коду
                        </Button>
                      </>
                    )}
                    {b.prepaymentDecision === 'PENDING' && canDecide && (
                      <>
                        <Button
                          size='sm'
                          variant='outline'
                          onClick={() =>
                            setDecideFor({ b, decision: 'REFUNDED' })
                          }
                        >
                          Вернуть 10%
                        </Button>
                        <Button
                          size='sm'
                          variant='outline'
                          onClick={() =>
                            setDecideFor({ b, decision: 'RETAINED' })
                          }
                        >
                          Удержать 10%
                        </Button>
                      </>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <IssueDialog buyout={issueFor} onClose={() => setIssueFor(null)} />
      <ReasonDialog
        open={decideFor !== null}
        onOpenChange={(v) => !v && setDecideFor(null)}
        title={
          decideFor?.decision === 'REFUNDED'
            ? 'Вернуть 10% покупателю'
            : 'Удержать 10%'
        }
        description={
          decideFor
            ? `${decideFor.b.lotTitle} · ${decideFor.b.buyer.name} · ${sum(decideFor.b.prepaymentAmount)}. Победитель не забрал товар за 24 часа.`
            : ''
        }
        confirm={decideFor?.decision === 'REFUNDED' ? 'Вернуть' : 'Удержать'}
        destructive={decideFor?.decision === 'RETAINED'}
        pending={decide.isPending}
        onConfirm={(reason) =>
          decideFor &&
          decide.mutate(
            { id: decideFor.b.id, decision: decideFor.decision, reason },
            { onSuccess: () => setDecideFor(null) }
          )
        }
      />
    </PageShell>
  )
}

function IssueDialog({
  buyout,
  onClose,
}: {
  buyout: Buyout | null
  onClose: () => void
}) {
  const [code, setCode] = useState('')
  const issue = useIssue()
  const close = () => {
    setCode('')
    issue.reset()
    onClose()
  }
  return (
    <Dialog open={buyout !== null} onOpenChange={(v) => !v && close()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Выдать товар</DialogTitle>
          <DialogDescription>
            {buyout?.lotTitle} · {buyout?.buyer.name}. Сверьте товар с актом
            проверки и попросите у покупателя код из его профиля.
          </DialogDescription>
        </DialogHeader>
        <Field
          label='Код выдачи'
          hint='6 цифр. Неверный код записывается в журнал.'
        >
          <Input
            inputMode='numeric'
            autoComplete='off'
            maxLength={6}
            value={code}
            onChange={(e) => setCode(digits(e.target.value).slice(0, 6))}
            className='text-center font-mono text-lg tracking-[0.3em]'
          />
        </Field>
        <DialogFooter>
          <Button variant='outline' onClick={close}>
            Отмена
          </Button>
          <Button
            disabled={code.length !== 6 || issue.isPending || !buyout}
            onClick={() =>
              buyout &&
              issue.mutate({ id: buyout.id, code }, { onSuccess: close })
            }
          >
            Выдать
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
