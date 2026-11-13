import { useState } from 'react'
import { Link, createFileRoute } from '@tanstack/react-router'
import { SESSION_TZ, currentOrNextSession } from '@auksion/shared'
import { useI18n } from '@/app/i18n'
import { useLots } from '@/entities/lot/api'
import { isAdmitted } from '@/entities/lot/demo-store'
import { type Condition, type Lot } from '@/entities/lot/types'
import { cn } from '@/shared/lib/cn'
import { formatCountdown, useNow } from '@/shared/lib/use-now'
import { LiveBadge } from '@/shared/ui/live-badge'
import { LotPhoto } from '@/shared/ui/lot-photo'
import { Price } from '@/shared/ui/price'

type Filter = 'all' | Condition

function SessionStrip() {
  const { t, locale } = useI18n()
  const now = useNow()
  const s = currentOrNextSession(new Date(now))
  const target = s.isLive ? s.closesAt : s.opensAt
  const when = new Intl.DateTimeFormat(locale === 'uz' ? 'uz-Latn' : 'ru-RU', {
    timeZone: SESSION_TZ,
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  }).format(target)
  return (
    <div className='flex items-center justify-between rounded-2xl bg-surface px-4 py-3'>
      <div className='grid'>
        <span className='text-[13px] text-muted'>{s.isLive ? t('catalog.liveNow') : t('catalog.nextSession')}</span>
        <span className='text-[13px]'>
          {s.isLive ? `${t('catalog.until')} ` : ''}
          {when}
        </span>
      </div>
      <span className='tabular text-lg font-semibold'>{formatCountdown(target.getTime() - now, t('time.d'))}</span>
    </div>
  )
}

function LotCard({ lot }: { lot: Lot }) {
  const { t } = useI18n()
  const live = lot.status === 'live'
  const admitted = isAdmitted(lot.id)
  return (
    <div className='grid gap-2'>
      <Link
        to='/lot/$lotId'
        params={{ lotId: lot.id }}
        className='grid grid-cols-[104px_1fr] gap-3 rounded-2xl p-1 transition-colors active:bg-surface'
      >
        <LotPhoto hue={lot.hue} className='aspect-square'>
          {live && <LiveBadge />}
        </LotPhoto>
        <div className='flex min-w-0 flex-col gap-1 py-1'>
          <span className='line-clamp-2 text-[15px] leading-snug font-medium'>{lot.title}</span>
          <span className='text-[12.5px] text-muted'>
            {t(lot.condition === 'new' ? 'lot.condition.new' : 'lot.condition.used')} · {t('lot.admitted')}{' '}
            {lot.admittedCount}
          </span>
          <div className='mt-auto flex items-baseline justify-between gap-2'>
            <span className='grid'>
              <span className='text-[11.5px] text-muted'>{lot.currentPrice ? t('lot.current') : t('lot.start')}</span>
              <Price
                value={lot.currentPrice ?? lot.startPrice}
                className={cn('text-[17px] font-bold', lot.currentPrice && 'text-brand-ink')}
              />
            </span>
            {admitted && <span className='text-[11.5px] font-medium text-ok'>✓ {t('lot.admittedBadge')}</span>}
          </div>
        </div>
      </Link>
      {live && (
        <Link
          to={admitted ? '/lot/$lotId/room' : '/lot/$lotId'}
          params={{ lotId: lot.id }}
          search={admitted ? undefined : { admit: true }}
          className='flex h-11 items-center justify-center rounded-xl bg-primary text-[15px] font-semibold text-on-primary active:opacity-80'
        >
          {admitted ? t('catalog.toRoom') : t('lot.participate')}
        </Link>
      )}
    </div>
  )
}

function Catalog() {
  const { t } = useI18n()
  const { data: lots = [] } = useLots()
  const [filter, setFilter] = useState<Filter>('all')
  const visible = lots.filter((l) => filter === 'all' || l.condition === filter)

  return (
    <div className='flex flex-col gap-4 px-4 pt-4'>
      <SessionStrip />

      <div className='flex gap-2 overflow-x-auto' role='tablist' aria-label='Категории'>
        <span className='rounded-full bg-fg px-3.5 py-1.5 text-[13px] font-medium text-bg'>
          {t('catalog.category.phones')}
        </span>
        <span className='rounded-full bg-surface px-3.5 py-1.5 text-[13px] text-muted'>
          {t('catalog.category.travel')} · {t('catalog.soon')}
        </span>
      </div>

      <div className='flex gap-4 border-b border-line text-[14px]'>
        {(['all', 'new', 'used'] as const).map((f) => (
          <button
            key={f}
            type='button'
            onClick={() => setFilter(f)}
            className={cn(
              '-mb-px border-b-2 pb-2',
              filter === f ? 'border-primary font-semibold text-fg' : 'border-transparent text-muted'
            )}
          >
            {t(f === 'all' ? 'filter.all' : f === 'new' ? 'filter.new' : 'filter.used')}
          </button>
        ))}
      </div>

      <div className='flex flex-col gap-2'>
        {visible.map((lot) => (
          <LotCard key={lot.id} lot={lot} />
        ))}
      </div>
    </div>
  )
}

export const Route = createFileRoute('/')({ component: Catalog })
