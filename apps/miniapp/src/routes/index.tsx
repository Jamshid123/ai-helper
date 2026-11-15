import { useState } from 'react'
import { Link, createFileRoute } from '@tanstack/react-router'
import { useI18n } from '@/app/i18n'
import { isSignedIn, useMe } from '@/entities/account/session'
import { DEMO, isFull, participantsOf, useAdmissions, useCategories, useLots } from '@/entities/lot/api'
import { type Condition, type Lot } from '@/entities/lot/types'
import { cn } from '@/shared/lib/cn'
import { formatSessionDate } from '@/shared/lib/format-date'
import { formatCountdown, useNow } from '@/shared/lib/use-now'
import { LiveBadge } from '@/shared/ui/live-badge'
import { Logo } from '@/shared/ui/logo'
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

function LotCard({ lot }: { lot: Lot }) {
  const { t } = useI18n()
  const live = lot.status === 'live'
  const admissions = useAdmissions()
  const admitted = admissions.has(lot.id)
  const count = participantsOf(lot)
  const full = !admitted && isFull(lot)
  return (
    <div className='grid gap-2 border-b border-line pb-4 last:border-b-0 md:content-start md:rounded-2xl md:border md:p-3 md:last:border-b'>
      <Link
        to='/lot/$lotId'
        params={{ lotId: lot.id }}
        className='grid grid-cols-[104px_1fr] gap-3 rounded-2xl p-1 transition-colors active:bg-surface md:grid-cols-1 md:p-0 md:hover:opacity-95'
      >
        <LotPhoto hue={lot.hue} src={lot.photos?.[0]} className='aspect-square md:aspect-[4/3]'>
          {live && <LiveBadge />}
        </LotPhoto>
        <div className='flex min-w-0 flex-col gap-1 py-1'>
          <span className='line-clamp-2 text-[15px] leading-snug font-medium'>{lot.title}</span>
          <span className='text-[12.5px] text-muted'>
            {t(lot.condition === 'new' ? 'lot.condition.new' : 'lot.condition.used')}
            {` · ${t('lot.admitted')}: ${count}${lot.maxParticipants ? ` ${t('lot.of')} ${lot.maxParticipants}` : ''}`}
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
  const signedIn = isSignedIn(useMe().me)
  const categories = useCategories()
  const [picked, setPicked] = useState<string | null>(null)
  const category = picked && categories.some((c) => c.slug === picked) ? picked : (categories[0]?.slug ?? null)
  const [filter, setFilter] = useState<Filter>('all')
  const visible = lots.filter(
    (l) => (category === null || l.category === category) && (filter === 'all' || l.condition === filter)
  )

  return (
    <div className='flex flex-col gap-4 px-4 pt-4 md:px-6 md:pt-6'>
      {/* Телефон: логотип вверху каталога (на десктопе он в шапке) */}
      <header className='flex min-h-10 items-center justify-between md:hidden'>
        <Logo />
        {!signedIn && (
          <Link to='/register' className='rounded-lg px-3 py-2 text-[14px] font-medium text-brand-ink'>
            {t('login.title')}
          </Link>
        )}
      </header>
      <SessionStrip lots={lots} />

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

      <div className='flex flex-col gap-4 md:grid md:grid-cols-2 md:gap-5 lg:grid-cols-3'>
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
