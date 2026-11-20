import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearch } from '@tanstack/react-router'
import { ChevronRight } from 'lucide-react'
import { useAuthStore } from '@/stores/auth-store'
import { canAccess } from '@/lib/rbac'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { PageShell } from '@/components/layout/page-shell'
import { dateTime, sum } from '@/features/manage/format'
import {
  type OverviewAttention,
  type OverviewLot,
  type Period,
  PERIODS,
  parsePeriod,
  useOverviewAttention,
  useOverviewAuctions,
  useOverviewMetrics,
} from './api'

function formatLeft(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const d = Math.floor(total / 86_400)
  const h = Math.floor((total % 86_400) / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const hms = [h, m, s].map((n) => String(n).padStart(2, '0')).join(':')
  return d > 0 ? `${d} д ${hms}` : hms
}

function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
  return now
}

const count = new Intl.NumberFormat('ru-RU')

/**
 * «Обзор» (ТЗ 20.11.2026): что происходит на площадке и что нужно сделать — вместо карточек-ссылок,
 * которые дублировали меню. Три независимых блока: ошибка одного не ломает остальные. Каждый блок
 * и показатель — только при праве сотрудника (проверяет сервер). Время — по Ташкенту, таймеры — по
 * серверному времени. Подписок и «товарного бюджета» нет: вне задачи (решение владельца 20.11.2026).
 */
export function Dashboard() {
  const user = useAuthStore((s) => s.user)
  const search: { period?: unknown } = useSearch({ strict: false })
  const period = parsePeriod(search.period) ?? '7d'
  const navigate = useNavigate()

  return (
    <PageShell
      title='Обзор'
      description='Время — по Ташкенту. Показатели «за период» считаются по выбранным дням, «всего» — на текущий момент.'
      actions={
        <div
          role='group'
          aria-label='Период показателей'
          className='flex gap-1 rounded-md border p-1'
        >
          {PERIODS.map((p) => (
            <Button
              key={p.id}
              size='sm'
              variant={period === p.id ? 'default' : 'ghost'}
              aria-pressed={period === p.id}
              onClick={() =>
                navigate({
                  to: '/',
                  search: p.id === '7d' ? {} : { period: p.id },
                })
              }
            >
              {p.text}
            </Button>
          ))}
        </div>
      }
    >
      <div className='grid gap-4'>
        <Metrics period={period} />
        <div className='grid gap-4 lg:grid-cols-3'>
          {canAccess(user, 'lots') && (
            <div className='lg:col-span-2'>
              <Auctions />
            </div>
          )}
          <Attention />
        </div>
      </div>
    </PageShell>
  )
}

function BlockError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className='flex flex-wrap items-center gap-3 text-sm text-muted-foreground'>
      Не удалось загрузить.
      <Button size='sm' variant='outline' onClick={onRetry}>
        Повторить
      </Button>
    </div>
  )
}

function Metrics({ period }: { period: Period }) {
  const { data, isLoading, isError, refetch } = useOverviewMetrics(period)
  const periodText = PERIODS.find((p) => p.id === period)?.text.toLowerCase()
  if (isLoading)
    return (
      <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5'>
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className='h-24' />
        ))}
      </div>
    )
  if (isError || !data)
    return (
      <Card>
        <CardContent>
          <BlockError onRetry={() => refetch()} />
        </CardContent>
      </Card>
    )
  const cards = [
    {
      label: 'Покупатели — всего',
      value: data.usersTotal,
      hint: 'на текущий момент',
    },
    {
      label: 'Новые покупатели',
      value: data.usersNew,
      hint: `за ${periodText}`,
    },
    {
      label: 'Продано лотов',
      value: data.lotsSold,
      hint: `торги с победителем, за ${periodText}`,
    },
    {
      label: 'Выдано покупок',
      value: data.purchasesCompleted,
      hint: `оплачено и выдано, за ${periodText}`,
    },
  ].flatMap((c) =>
    c.value === undefined ? [] : [{ ...c, text: count.format(c.value) }]
  )
  if (data.completedAmount !== undefined)
    cards.push({
      label: 'Выкуплено на сумму',
      value: 0,
      hint: `по выданным покупкам, за ${periodText}`,
      text: sum(data.completedAmount),
    })
  if (cards.length === 0) return null
  return (
    <section
      aria-label='Показатели'
      className='grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5'
    >
      {cards.map((c) => (
        <Card key={c.label} className='gap-2'>
          <CardHeader>
            <CardDescription>{c.label}</CardDescription>
            <CardTitle className='text-2xl font-semibold break-words tabular-nums'>
              {c.text}
            </CardTitle>
          </CardHeader>
          <CardContent className='text-xs text-muted-foreground'>
            {c.hint}
          </CardContent>
        </Card>
      ))}
    </section>
  )
}

function Auctions() {
  const { data, isLoading, isError, refetch, dataUpdatedAt } =
    useOverviewAuctions(true)
  const now = useNow()
  // таймеры — по серверному времени: поправка на расхождение часов браузера
  const offset = data ? Date.parse(data.serverTime) - dataUpdatedAt : 0
  const serverNow = now + offset

  return (
    <Card className='h-full'>
      <CardHeader>
        <CardTitle className='text-base'>Торги</CardTitle>
        <CardDescription>
          Идут сейчас и ближайшие запланированные
        </CardDescription>
      </CardHeader>
      <CardContent className='grid gap-4'>
        {isLoading && <Skeleton className='h-24' />}
        {isError && <BlockError onRetry={() => refetch()} />}
        {data && data.live.length === 0 && data.upcoming.length === 0 && (
          <p className='text-sm text-muted-foreground'>
            Сейчас торгов нет, ближайшие не запланированы.{' '}
            <Link to='/lots' search={{ status: 'draft' }} className='underline'>
              Черновики лотов
            </Link>
          </p>
        )}
        {data && data.live.length > 0 && (
          <LotList
            title='Идут сейчас'
            lots={data.live}
            render={(l) => (
              <>
                <span className='tabular-nums'>
                  {l.currentPrice
                    ? sum(l.currentPrice)
                    : `старт ${sum(l.startPrice)}`}
                </span>
                <span className='text-xs text-muted-foreground'>
                  до окончания{' '}
                  <span className='font-medium text-foreground tabular-nums'>
                    {formatLeft(Date.parse(l.endsAt) - serverNow)}
                  </span>
                </span>
              </>
            )}
            filter='live'
          />
        )}
        {data && data.upcoming.length > 0 && (
          <LotList
            title='Ближайшие'
            lots={data.upcoming}
            render={(l) => (
              <>
                <span className='text-sm'>{dateTime(l.opensAt)}</span>
                <span className='text-xs text-muted-foreground'>
                  через{' '}
                  <span className='tabular-nums'>
                    {formatLeft(Date.parse(l.opensAt) - serverNow)}
                  </span>
                </span>
              </>
            )}
            filter='scheduled'
          />
        )}
      </CardContent>
    </Card>
  )
}

function LotList({
  title,
  lots,
  render,
  filter,
}: {
  title: string
  lots: OverviewLot[]
  render: (l: OverviewLot) => React.ReactNode
  filter: 'live' | 'scheduled'
}) {
  return (
    <div className='grid gap-2'>
      <h3 className='text-sm font-medium'>{title}</h3>
      <ul className='divide-y rounded-md border'>
        {lots.map((l) => (
          <li key={l.id}>
            <Link
              to='/lots'
              search={{ status: filter }}
              className='flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-3 py-2 transition-colors hover:bg-accent'
            >
              <span className='min-w-0'>
                <span className='block truncate text-sm font-medium'>
                  {l.title}
                </span>
                <span className='text-xs text-muted-foreground'>
                  участников: {l.admittedCount}
                  {l.maxParticipants ? ` из ${l.maxParticipants}` : ''}
                </span>
              </span>
              <span className='grid justify-items-end gap-0.5'>
                {render(l)}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}

const ATTENTION: {
  key: keyof OverviewAttention
  text: string
  to: '/fulfillment' | '/finance' | '/lots' | '/results'
  search?: { status: 'draft' }
}[] = [
  { key: 'awaitingPickup', text: 'Ждут выдачи', to: '/fulfillment' },
  {
    key: 'awaitingPrepayment',
    text: 'Ждём оплату 10% от победителя',
    to: '/fulfillment',
  },
  { key: 'prepaymentDecisions', text: 'Решения по 10%', to: '/finance' },
  { key: 'underReview', text: 'Лоты на проверке после сбоя', to: '/results' },
  {
    key: 'drafts',
    text: 'Черновики лотов',
    to: '/lots',
    search: { status: 'draft' },
  },
]

function Attention() {
  const { data, isLoading, isError, refetch } = useOverviewAttention()
  const items = data ? ATTENTION.filter((a) => data[a.key] !== undefined) : []
  const open = items.filter((a) => (data?.[a.key] ?? 0) > 0)
  // нет ни одного показателя по правам — блок не нужен
  if (data && items.length === 0) return null
  return (
    <Card className='h-full'>
      <CardHeader>
        <CardTitle className='text-base'>Требуют внимания</CardTitle>
        <CardDescription>Только необработанные</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading && <Skeleton className='h-24' />}
        {isError && <BlockError onRetry={() => refetch()} />}
        {data && open.length === 0 && (
          <p className='text-sm text-muted-foreground'>Всё обработано.</p>
        )}
        {open.length > 0 && (
          <ul className='divide-y rounded-md border'>
            {open.map((a) => (
              <li key={a.key}>
                <Link
                  to={a.to}
                  search={a.search}
                  className='flex items-center gap-3 px-3 py-2 text-sm transition-colors hover:bg-accent'
                >
                  <span className='flex-1'>{a.text}</span>
                  <span className='rounded-full bg-primary px-2 py-0.5 text-xs font-semibold text-primary-foreground tabular-nums'>
                    {count.format(data?.[a.key] ?? 0)}
                  </span>
                  <ChevronRight className='size-4 text-muted-foreground' />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
