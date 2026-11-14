import { useEffect, useState } from 'react'
import { SECTIONS_BY_ID } from '@/config/sections'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
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
  useCancelAdmission,
  useLift,
  useParticipant,
  useParticipants,
  useRestrict,
} from './api'
import { dateTime, digits } from './format'
import { EmptyRow, Field, ReasonDialog } from './ui'
import { useCanEdit } from './use-can-edit'

function useDebounced(value: string, ms = 300) {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return v
}

export function ParticipantsPage() {
  const meta = SECTIONS_BY_ID.participants
  const [q, setQ] = useState('')
  const { data = [], isFetching } = useParticipants(useDebounced(q.trim()))
  const [openId, setOpenId] = useState<string | null>(null)

  return (
    <PageShell title={meta.title} description={meta.description}>
      <Input
        className='mb-4 max-w-md'
        placeholder='Имя, телефон или Telegram ID'
        value={q}
        onChange={(e) => setQ(e.target.value)}
        aria-label='Поиск участника'
      />
      <div className='rounded-md border'>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Участник</TableHead>
              <TableHead>Телефон</TableHead>
              <TableHead>Telegram</TableHead>
              <TableHead className='text-right'>Допуски</TableHead>
              <TableHead>Ограничение</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {!isFetching && data.length === 0 && (
              <EmptyRow cols={5} text='Никого не нашли' />
            )}
            {data.map((u) => (
              <TableRow
                key={u.id}
                className='cursor-pointer'
                onClick={() => setOpenId(u.id)}
              >
                <TableCell className='font-medium'>
                  {[u.firstName, u.lastName].filter(Boolean).join(' ')}
                  <span className='block text-xs text-muted-foreground'>
                    в торгах: {u.publicName}
                  </span>
                </TableCell>
                <TableCell className='tabular-nums'>{u.phone ?? '—'}</TableCell>
                <TableCell className='text-sm'>
                  {u.username ? `@${u.username}` : '—'}
                  <span className='block font-mono text-xs text-muted-foreground'>
                    {u.telegramId}
                  </span>
                </TableCell>
                <TableCell className='text-right tabular-nums'>
                  {u.admissions}
                </TableCell>
                <TableCell>
                  {u.restrictedUntil ? (
                    <Badge variant='destructive'>
                      до {dateTime(u.restrictedUntil)}
                    </Badge>
                  ) : (
                    '—'
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <ParticipantSheet id={openId} onClose={() => setOpenId(null)} />
    </PageShell>
  )
}

function ParticipantSheet({
  id,
  onClose,
}: {
  id: string | null
  onClose: () => void
}) {
  const { data: u } = useParticipant(id)
  const restrict = useRestrict()
  const lift = useLift()
  const cancel = useCancelAdmission()
  const editable = useCanEdit('participants')
  const [dialog, setDialog] = useState<
    | null
    | { kind: 'restrict' }
    | { kind: 'lift' }
    | { kind: 'cancel'; lotId: string; title: string }
  >(null)
  const [days, setDays] = useState('14')
  const close = () => setDialog(null)

  return (
    <Sheet open={id !== null} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className='w-full overflow-y-auto sm:max-w-lg'>
        {u && (
          <>
            <SheetHeader>
              <SheetTitle>
                {[u.firstName, u.lastName].filter(Boolean).join(' ')}
              </SheetTitle>
              <SheetDescription>
                {u.phone ?? 'телефон не подтверждён'} ·{' '}
                {u.username ? `@${u.username}` : `ID ${u.telegramId}`}
              </SheetDescription>
            </SheetHeader>
            <div className='grid gap-6 px-4 pb-6'>
              <section className='grid gap-2'>
                <h3 className='text-sm font-semibold'>Ограничение участия</h3>
                {!editable ? (
                  <p className='text-sm text-muted-foreground'>
                    {u.restriction
                      ? `До ${dateTime(u.restriction.endsAt)}. Причина: ${u.restriction.reason}`
                      : 'Нет'}
                  </p>
                ) : u.restriction ? (
                  <div className='rounded-md border border-destructive/40 p-3 text-sm'>
                    До {dateTime(u.restriction.endsAt)}. Причина:{' '}
                    {u.restriction.reason}
                    <Button
                      variant='outline'
                      size='sm'
                      className='mt-2 w-full'
                      onClick={() => setDialog({ kind: 'lift' })}
                    >
                      Снять ограничение
                    </Button>
                  </div>
                ) : (
                  <Button
                    variant='outline'
                    size='sm'
                    onClick={() => setDialog({ kind: 'restrict' })}
                  >
                    Ограничить участие
                  </Button>
                )}
              </section>

              <section className='grid gap-2'>
                <h3 className='text-sm font-semibold'>Допуски</h3>
                {u.admissions.length === 0 && (
                  <p className='text-sm text-muted-foreground'>Нет</p>
                )}
                {u.admissions.map((a) => (
                  <div
                    key={a.lotId}
                    className='flex items-center justify-between gap-2 rounded-md border p-3 text-sm'
                  >
                    <span>
                      {a.title}
                      <span className='block text-xs text-muted-foreground'>
                        торги {dateTime(a.opensAt)}
                      </span>
                    </span>
                    {editable && a.canCancel && (
                      <Button
                        variant='ghost'
                        size='sm'
                        className='text-destructive'
                        onClick={() =>
                          setDialog({
                            kind: 'cancel',
                            lotId: a.lotId,
                            title: a.title,
                          })
                        }
                      >
                        Отменить с возвратом
                      </Button>
                    )}
                  </div>
                ))}
              </section>

              {u.restrictions.length > 0 && (
                <section className='grid gap-2'>
                  <h3 className='text-sm font-semibold'>История ограничений</h3>
                  {u.restrictions.map((r) => (
                    <div key={r.id} className='rounded-md bg-muted p-3 text-xs'>
                      {dateTime(r.startsAt)} — {dateTime(r.endsAt)}: {r.reason}
                      {r.liftedAt && (
                        <span className='block text-muted-foreground'>
                          снято {dateTime(r.liftedAt)}: {r.liftReason}
                        </span>
                      )}
                    </div>
                  ))}
                </section>
              )}
            </div>

            <ReasonDialog
              open={dialog?.kind === 'restrict'}
              onOpenChange={(v) => !v && close()}
              title='Ограничить участие'
              description='Участник не сможет оформлять допуски и предлагать цену до окончания срока. Каталог остаётся доступен.'
              confirm='Ограничить'
              destructive
              pending={restrict.isPending}
              onConfirm={(reason) =>
                restrict.mutate(
                  { userId: u.id, days: Number(days || 0), reason },
                  { onSuccess: close }
                )
              }
            >
              <Field label='Срок, дней' hint='От 1 до 365'>
                <Input
                  inputMode='numeric'
                  value={days}
                  onChange={(e) => setDays(digits(e.target.value).slice(0, 3))}
                />
              </Field>
            </ReasonDialog>
            <ReasonDialog
              open={dialog?.kind === 'lift'}
              onOpenChange={(v) => !v && close()}
              title='Снять ограничение?'
              description='Участник снова сможет участвовать в торгах.'
              confirm='Снять'
              pending={lift.isPending}
              onConfirm={(reason) =>
                u.restriction &&
                lift.mutate(
                  { userId: u.id, restrictionId: u.restriction.id, reason },
                  { onSuccess: close }
                )
              }
            />
            <ReasonDialog
              open={dialog?.kind === 'cancel'}
              onOpenChange={(v) => !v && close()}
              title='Отменить допуск?'
              description={
                dialog?.kind === 'cancel'
                  ? `«${dialog.title}». Участнику вернётся 100% взноса.`
                  : ''
              }
              confirm='Отменить допуск'
              destructive
              pending={cancel.isPending}
              onConfirm={(reason) =>
                dialog?.kind === 'cancel' &&
                cancel.mutate(
                  { userId: u.id, lotId: dialog.lotId, reason },
                  { onSuccess: close }
                )
              }
            />
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}
