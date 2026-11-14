import { useMemo, useState } from 'react'
import { SECTIONS_BY_ID } from '@/config/sections'
import { CalendarPlus, Timer, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { PageShell } from '@/components/layout/page-shell'
import { type Lot, useLots, usePublishLot } from './api'
import { sum, windowText } from './format'
import { LotDialog } from './lot-dialog'
import { LotStatusBadge } from './ui'
import { useCanEdit } from './use-can-edit'

const dayKey = (iso: string) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tashkent' }).format(
    new Date(iso)
  ) // YYYY-MM-DD
const dayTitle = (key: string) =>
  new Intl.DateTimeFormat('ru-RU', {
    timeZone: 'Asia/Tashkent',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date(`${key}T12:00:00+05:00`))
const duration = (l: Lot) => {
  const m = Math.round(
    (Date.parse(l.closesAt) - Date.parse(l.opensAt)) / 60_000
  )
  if (m % 1440 === 0) return `${m / 1440} дн`
  if (m % 60 === 0) return `${m / 60} ч`
  return m > 60 ? `${Math.floor(m / 60)} ч ${m % 60} мин` : `${m} мин`
}
const ACTIVE: Lot['status'][] = ['DRAFT', 'SCHEDULED', 'LIVE']

/** Расписание торгов (решение 14.11.2026): любой день и время, длительность, участники, ожидание ставки. */
export function SchedulePage() {
  const meta = SECTIONS_BY_ID.schedule
  const { data = [], isLoading } = useLots()
  const publish = usePublishLot()
  const canEditLots = useCanEdit('lots')
  const [creating, setCreating] = useState(false)
  const [showPast, setShowPast] = useState(false)

  const days = useMemo(() => {
    const list = data
      .filter((l) => showPast || ACTIVE.includes(l.status))
      .sort((a, b) => Date.parse(a.opensAt) - Date.parse(b.opensAt))
    const map = new Map<string, Lot[]>()
    for (const l of list)
      map.set(dayKey(l.opensAt), [...(map.get(dayKey(l.opensAt)) ?? []), l])
    return [...map.entries()]
  }, [data, showPast])

  return (
    <PageShell
      title={meta.title}
      description={meta.description}
      actions={
        canEditLots && (
          <Button onClick={() => setCreating(true)}>
            <CalendarPlus /> Новые торги
          </Button>
        )
      }
    >
      <label className='mb-4 flex w-max items-center gap-2 text-sm text-muted-foreground'>
        <Switch checked={showPast} onCheckedChange={setShowPast} /> Показать
        завершённые и отменённые
      </label>
      {!isLoading && days.length === 0 && (
        <div className='rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground'>
          Запланированных торгов нет. Нажмите «Новые торги» и выберите товар со
          склада.
        </div>
      )}
      <div className='grid gap-6'>
        {days.map(([day, lots]) => (
          <section key={day} className='grid gap-2'>
            <h2 className='text-sm font-semibold first-letter:uppercase'>
              {dayTitle(day)}
            </h2>
            <ul className='divide-y rounded-md border'>
              {lots.map((l) => (
                <li
                  key={l.id}
                  className='flex flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3'
                >
                  <div className='min-w-48 flex-1'>
                    <div className='font-medium'>{l.title}</div>
                    <div className='text-xs text-muted-foreground'>
                      {windowText(l.opensAt, l.closesAt)} · {duration(l)} ·
                      старт {sum(l.startPrice)}
                    </div>
                  </div>
                  <span
                    className='inline-flex items-center gap-1 text-sm tabular-nums'
                    title='Участники: набрано / минимум / максимум'
                  >
                    <Users className='size-4 text-muted-foreground' />
                    {l.admittedCount}
                    {l.maxParticipants ? ` из ${l.maxParticipants}` : ''}
                    {l.minParticipants ? (
                      <span className='text-xs text-muted-foreground'>
                        {' '}
                        · мин. {l.minParticipants}
                      </span>
                    ) : null}
                  </span>
                  <span
                    className='inline-flex items-center gap-1 text-sm text-muted-foreground'
                    title='Ожидание следующей ставки'
                  >
                    <Timer className='size-4' />
                    {l.bidTimeoutSec
                      ? `${Math.round(l.bidTimeoutSec / 60)} мин`
                      : 'без ожидания'}
                  </span>
                  <LotStatusBadge status={l.status} />
                  {canEditLots && l.status === 'DRAFT' && (
                    <Button
                      size='sm'
                      disabled={publish.isPending}
                      onClick={() => publish.mutate(l.id)}
                    >
                      Опубликовать
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      {creating && <LotDialog open onOpenChange={setCreating} />}
    </PageShell>
  )
}
