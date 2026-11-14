import { useState } from 'react'
import { X } from 'lucide-react'
import { Link, createFileRoute } from '@tanstack/react-router'
import { useI18n } from '@/app/i18n'
import { DEMO, isFull, useAdmissions, useCategories, useLots } from '@/entities/lot/api'
import { type Condition, type Lot } from '@/entities/lot/types'
import { cn } from '@/shared/lib/cn'
import { formatSessionDate } from '@/shared/lib/format-date'
import { formatCountdown, useNow } from '@/shared/lib/use-now'
import { LiveBadge } from '@/shared/ui/live-badge'
import { LotPhoto } from '@/shared/ui/lot-photo'
import { Price } from '@/shared/ui/price'

type Filter = 'all' | Condition

/** Полоса сверху: идущие торги — «идут до…», иначе ближайшее начало по лотам (торги в любой день — решение 14.11.2026). */
function SessionStrip({ lots }: { lots: Lot[] }) {
  const { t, locale } = useI18n()
  const now = useNow()
  const live = lots.filter((l) => l.status === 'live')
  const upcoming = lots.filter((l) => l.status === 'scheduled' && Date.parse(l.opensAt) > now)
  const target = live.length
    ? new Date(Math.min(...live.map((l) => Date.parse(l.endsAt ?? l.closesAt))))
    : upcoming.length
      ? new Date(Math.min(...upcoming.map((l) => Date.parse(l.opensAt))))
      : null
  if (!target) return null
  const isLive = live.length > 0
  const title = isLive && DEMO ? t('catalog.demoLive') : isLive ? t('catalog.liveNow') : t('catalog.nextSession')
  return (
    <div className='flex items-center justify-between rounded-2xl bg-surface px-4 py-3'>
      <div className='grid'>
        <span className='text-[13px] text-muted'>{title}</span>
        <span className='text-[13px]'>
          {isLive
            ? locale === 'uz'
              ? `${formatSessionDate(target, locale)} ${t('catalog.until')}`
              : `${t('catalog.until')} ${formatSessionDate(target, locale)}`
            : formatSessionDate(target, locale)}
        </span>
      </div>
      <span className={cn('tabular text-lg font-semibold', isLive && 'text-hot-text')}>
        {formatCountdown(target.getTime() - now, t('time.d'))}
      </span>
    </div>
  )
}

const HOWTO_KEY = 'auksion.howto.hidden'

function HowTo() {
  const { t } = useI18n()
  const [hidden, setHidden] = useState(() => {
    try {
      return localStorage.getItem(HOWTO_KEY) === '1'
    } catch {
      return false
    }
  })
  if (hidden) return null
  const hide = () => {
    setHidden(true)
    try {
      localStorage.setItem(HOWTO_KEY, '1')
    } catch {
      // не критично
    }
  }
  return (
    <section className='relative rounded-2xl border border-line px-4 py-3' aria-label={t('howto.title')}>
      <div className='mb-2 flex items-center justify-between'>
        <h2 className='text-[15px] font-semibold'>{t('howto.title')}</h2>
        <button
          type='button'
          onClick={hide}
          aria-label={t('howto.hide')}
          className='-mr-2 grid size-11 place-items-center text-muted'
        >
          <X className='size-4' />
        </button>
      </div>
      <ol className='grid gap-2'>
        {(['howto.1', 'howto.2', 'howto.3'] as const).map((k, i) => (
          <li key={k} className='grid grid-cols-[24px_1fr] gap-2 text-[13.5px] leading-snug'>
            <span className='grid size-6 place-items-center rounded-full bg-primary text-[12px] font-bold text-on-primary'>
              {i + 1}
            </span>
            <span className='pt-0.5'>{t(k)}</span>
          </li>
        ))}
      </ol>
    </section>
  )
}

function LotCard({ lot }: { lot: Lot }) {
  const { t } = useI18n()
  const live = lot.status === 'live'
  const admitted = useAdmissions().has(lot.id)
  const full = !admitted && isFull(lot)
  return (
    <div className='grid gap-2 border-b border-line pb-4 last:border-b-0'>
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
            {t(lot.condition === 'new' ? 'lot.condition.new' : 'lot.condition.used')} · {t('lot.admitted')}:{' '}
            {lot.admittedCount}
            {lot.maxParticipants ? ` ${t('lot.of')} ${lot.maxParticipants}` : ''}
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
      {live && full && (
        <span className='flex h-12 items-center justify-center rounded-xl bg-surface text-[15px] font-semibold text-muted'>
          {t('lot.full')}
        </span>
      )}
      {live && !full && (
        <Link
          to={admitted ? '/lot/$lotId/room' : '/lot/$lotId'}
          params={{ lotId: lot.id }}
          search={admitted ? undefined : { admit: true }}
          className='flex h-12 items-center justify-center rounded-xl bg-primary text-[15px] font-semibold text-on-primary active:opacity-80'
        >
          {admitted ? t('catalog.toRoom') : t('lot.participate')}
        </Link>
      )}
    </div>
  )
}

function Catalog() {
  const { t, locale } = useI18n()
  const { data: lots = [] } = useLots()
  const categories = useCategories()
  const [picked, setPicked] = useState<string | null>(null)
  const category = picked && categories.some((c) => c.slug === picked) ? picked : (categories[0]?.slug ?? null)
  const [filter, setFilter] = useState<Filter>('all')
  const visible = lots.filter(
    (l) => (category === null || l.category === category) && (filter === 'all' || l.condition === filter)
  )

  return (
    <div className='flex flex-col gap-4 px-4 pt-4'>
      <SessionStrip lots={lots} />
      <HowTo />

      <div className='flex gap-2 overflow-x-auto' role='tablist' aria-label={t('catalog.categories')}>
        {categories.map((c) => (
          <button
            key={c.slug}
            type='button'
            role='tab'
            aria-selected={c.slug === category}
            onClick={() => setPicked(c.slug)}
            className={cn(
              'min-h-9 shrink-0 rounded-full px-3.5 py-1.5 text-[13px] font-medium',
              c.slug === category ? 'bg-fg text-bg' : 'bg-surface text-fg'
            )}
          >
            {c.name[locale]}
          </button>
        ))}
        {DEMO && (
          <span className='shrink-0 rounded-full bg-surface px-3.5 py-1.5 text-[13px] text-muted'>
            {t('catalog.category.travel')} · {t('catalog.soon')}
          </span>
        )}
      </div>

      <div className='flex gap-4 border-b border-line text-[14px]'>
        {(['all', 'new', 'used'] as const).map((f) => (
          <button
            key={f}
            type='button'
            onClick={() => setFilter(f)}
            className={cn(
              '-mb-px flex h-11 items-end border-b-2 pb-2.5',
              filter === f ? 'border-primary font-semibold text-fg' : 'border-transparent text-muted'
            )}
          >
            {t(f === 'all' ? 'filter.all' : f === 'new' ? 'filter.new' : 'filter.used')}
          </button>
        ))}
      </div>

      <div className='flex flex-col gap-4'>
        {visible.map((lot) => (
          <LotCard key={lot.id} lot={lot} />
        ))}
        {lots.length > 0 && visible.length === 0 && (
          <p className='py-8 text-center text-[14px] text-muted'>{t('catalog.empty')}</p>
        )}
      </div>
    </div>
  )
}

export const Route = createFileRoute('/')({ component: Catalog })
