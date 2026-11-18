import { useCallback, useEffect, useState } from 'react'
import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { BadgeCheck, ChevronLeft } from 'lucide-react'
import { RULES } from '@auksion/shared'
import { useI18n } from '@/app/i18n'
import { haptic, useBackButton, useMainButton } from '@/app/platform'
import { endsAtOf, isFull, participantsOf, useAdmissions, useAdmit, useLot } from '@/entities/lot/api'
import { isSignedIn, useMe } from '@/entities/account/session'
import { errorText } from '@/shared/api/error-text'
import { type Lot } from '@/entities/lot/types'
import { cn } from '@/shared/lib/cn'
import { formatSessionDate } from '@/shared/lib/format-date'
import { formatCountdown, useNow } from '@/shared/lib/use-now'
import { LeaveCard } from '@/features/leave'
import { CarriedCard, RelistNotice } from '@/features/relist'
import { PurchaseCard } from '@/features/purchase-card'
import { usePurchases } from '@/entities/purchase/api'
import { RemindCard } from '@/features/remind'
import { ACTION_BAR } from '@/shared/ui/action-bar'
import { Button } from '@/shared/ui/button'
import { LiveBadge } from '@/shared/ui/live-badge'
import { PhotoCarousel } from '@/shared/ui/photo-carousel'
import { Price } from '@/shared/ui/price'

function Row({ label, children, stacked }: { label: string; children: React.ReactNode; stacked?: boolean }) {
  if (stacked)
    return (
      <div className='grid gap-0.5 py-2.5'>
        <span className='text-[14px] text-muted'>{label}</span>
        <span className='text-[14px]'>{children}</span>
      </div>
    )
  return (
    <div className='flex items-baseline justify-between gap-4 py-2.5'>
      <span className='shrink-0 text-[14px] text-muted'>{label}</span>
      <span className='text-right text-[14px]'>{children}</span>
    </div>
  )
}

function AdmissionSheet({ lot, onClose, onPaid }: { lot: Lot; onClose: () => void; onPaid: () => void }) {
  const { t } = useI18n()
  const [agree, setAgree] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const admit = useAdmit()
  // Допуск бесплатный (решение 18.11.2026): правила и обязательства победителя → допуск сразу, без оплаты
  const confirm = useCallback(() => {
    if (!agree || pending) return
    setPending(true)
    setError(null)
    admit(lot.id).then(
      () => {
        haptic('success')
        setPending(false)
        onPaid()
      },
      (e: unknown) => {
        haptic('error')
        setError(errorText(t, e))
        setPending(false)
      }
    )
  }, [agree, pending, admit, lot.id, onPaid, t])
  const native = useMainButton({
    text: t('admission.get'),
    onClick: confirm,
    enabled: agree && !pending,
    loading: pending,
  })

  return (
    <div
      className='fixed inset-0 z-30 flex items-end bg-black/40 md:items-center md:p-6'
      role='dialog'
      aria-modal='true'
      onClick={onClose}
    >
      <div
        className='mx-auto max-h-[92svh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-bg p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom,0px))] md:rounded-3xl md:pb-5'
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className='mb-1 text-lg font-semibold'>{t('admission.title')}</h2>
        <p className='mb-4 text-[14px] text-muted'>{lot.title}</p>
        <div className='mb-4 grid gap-0.5 rounded-2xl bg-surface px-4 py-3'>
          <span className='text-[15px] font-semibold text-ok'>{t('admission.free')}</span>
          <span className='text-[12.5px] text-muted'>{t('admission.free.note')}</span>
        </div>
        <div className='mb-4 grid gap-1.5 text-[13.5px] leading-snug'>
          <span className='font-medium'>{t('admission.duty.title')}</span>
          <ul className='grid gap-1 ps-5 text-muted [list-style:disc]'>
            <li>{t('admission.duty.1')}</li>
            <li>{t('admission.duty.2')}</li>
            <li>{t('admission.duty.3')}</li>
          </ul>
        </div>
        <dl className='mb-4 grid gap-2 text-[13px] leading-relaxed'>
          <div>
            <dt className='font-medium'>{t('lot.pickup')}</dt>
            <dd className='text-muted'>{t('lot.pickup.text')}</dd>
          </div>
        </dl>
        <label className='mb-5 flex items-start gap-3 text-[14px]'>
          <input
            id='agree'
            type='checkbox'
            checked={agree}
            onChange={(e) => setAgree(e.target.checked)}
            className='mt-0.5 size-5 accent-[var(--primary)]'
          />
          {t('admission.agree')}
        </label>
        {error && (
          <p role='alert' className='mb-4 rounded-xl bg-hot/10 px-4 py-3 text-[14px] font-medium text-hot-text'>
            {error}
          </p>
        )}
        <div className='flex flex-col-reverse gap-2 min-[360px]:grid min-[360px]:grid-cols-2'>
          <Button variant='ghost' onClick={onClose}>
            {t('admission.cancel')}
          </Button>
          {!native && (
            <Button onClick={confirm} disabled={!agree || pending}>
              {t('admission.get')}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

function LotPage() {
  const { lotId } = Route.useParams()
  const { t, locale } = useI18n()
  const navigate = useNavigate()
  const now = useNow()
  const { data: lot } = useLot(lotId)
  const search = Route.useSearch()
  const { me, loading: meLoading } = useMe()
  const registered = isSignedIn(me)
  const [opened, setSheet] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  const sheet = opened || (Boolean(search.admit) && registered && !dismissed)
  // Без входа «Участвовать» ведёт на вход по SMS-коду и возвращает к оформлению допуска.
  const toRegister = useCallback(
    () => navigate({ to: '/register', search: { next: `/lot/${lotId}?admit=true` } }),
    [navigate, lotId]
  )
  useEffect(() => {
    if (meLoading) return
    if (search.admit && !registered) toRegister()
  }, [search.admit, registered, meLoading, toRegister])
  const back = useCallback(() => navigate({ to: '/' }), [navigate])
  useBackButton(sheet ? null : back)

  const admissions = useAdmissions()
  const admitted = lot ? admissions.has(lot.id) : false
  const carriedInfo = lot ? admissions.info(lot.id) : undefined
  const live = lot?.status === 'live'
  // Торги закончились: ни «Участвовать», ни обратного отсчёта (баг 17.11.2026 — «Откроется через 00:00:00»)
  const closed = lot?.status === 'closed'
  const purchase = usePurchases().find((p) => p.lotId === lotId)
  const [left, setLeft] = useState<null | 'refund' | 'carried'>(null)
  const full = Boolean(lot && !admitted && isFull(lot))
  // Ограничение участия видно сразу, с датой — а не после галочки и «Оплатить» (решение 18.11.2026)
  const restrictedUntil =
    !admitted && me?.restrictedUntil && Date.parse(me.restrictedUntil) > now ? me.restrictedUntil : null
  // лимит одновременных допусков (решение 18.11.2026) — тоже заранее, а не после галочки
  const activeAdmissions = admissions.list.filter(
    (a) => a.admitted !== false && (a.status === 'SCHEDULED' || a.status === 'LIVE')
  ).length
  const atLimit = registered && !admitted && activeAdmissions >= RULES.MAX_ACTIVE_ADMISSIONS
  const blocked = full || Boolean(restrictedUntil) || atLimit
  const ctaText = admitted
    ? t('lot.toRoom')
    : restrictedUntil
      ? t('lot.restricted').replace('{until}', formatSessionDate(new Date(restrictedUntil), locale))
      : full
        ? t('lot.full')
        : atLimit
          ? t('lot.limit').replace('{n}', String(activeAdmissions))
          : t('lot.participate')
  const primary = useCallback(() => {
    if (!lot) return
    if (admitted && live) navigate({ to: '/lot/$lotId/room', params: { lotId: lot.id } })
    else if (!admitted && !blocked) {
      if (registered) setSheet(true)
      else toRegister()
    }
  }, [admitted, blocked, live, lot, navigate, registered, toRegister])
  const native = useMainButton({
    text: ctaText,
    onClick: primary,
    enabled: admitted || !blocked,
    visible: !sheet && Boolean(lot) && !closed && (!admitted || live),
  })

  if (!lot) return null
  // в демо и у старых ответов API флага нет — считаем, что акт есть (раньше бейдж был всегда)
  const deviceAct = lot.deviceAct !== false
  const attributes = lot.attributes ?? []
  const opens = Date.parse(lot.opensAt)
  const closes = endsAtOf(lot)

  return (
    <div
      className={cn(
        'flex flex-col gap-4 px-4 pt-4 lg:grid lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:items-start lg:gap-8 lg:px-6 lg:pt-6 lg:pb-10',
        !native && !closed && (!admitted || live) && 'pb-24'
      )}
    >
      {/* На телефоне шапки нет: явный путь назад в каталог (нижнее меню тоже доступно) */}
      <Link to='/' className='-mb-1 inline-flex min-h-11 items-center gap-1 self-start text-[14px] text-muted md:hidden'>
        <ChevronLeft className='size-4' aria-hidden='true' /> {t('nav.catalog')}
      </Link>
      <PhotoCarousel
        photos={lot.photos ?? []}
        hue={lot.hue}
        title={lot.title}
        className='aspect-[4/3] lg:sticky lg:top-24'
      >
        {live && <LiveBadge />}
      </PhotoCarousel>

      <div className='flex flex-col gap-4'>
        <div className='grid gap-1.5'>
          <h1 className='text-xl leading-tight font-semibold text-balance'>{lot.title}</h1>
          <div className='flex flex-wrap gap-1.5 text-[12px]'>
            {/* бейдж — только у категорий с актом эксперта (решение 18.11.2026) */}
            {deviceAct && (
              <span className='inline-flex items-center gap-1 rounded-md bg-surface px-2 py-0.5 font-medium text-brand-ink'>
                <BadgeCheck className='size-3.5' /> {t('lot.verified')}
              </span>
            )}
            <span className='rounded-md bg-surface px-2 py-0.5 text-muted'>
              {t(lot.condition === 'new' ? 'lot.condition.new' : 'lot.condition.used')}
            </span>
            <span className='rounded-md bg-surface px-2 py-0.5 text-muted'>
              {t('lot.seller')}: {t('lot.sellerPlatform')}
            </span>
          </div>
        </div>

        <div className='grid grid-cols-2 gap-2'>
          <div className='rounded-2xl bg-surface px-4 py-3'>
            <div className='text-[12px] text-muted'>{lot.currentPrice ? t('lot.current') : t('lot.start')}</div>
            <Price
              value={lot.currentPrice ?? lot.startPrice}
              className='text-lg font-bold whitespace-normal text-brand-ink min-[360px]:text-xl'
            />
          </div>
          <div className='rounded-2xl bg-surface px-4 py-3'>
            {closed ? (
              <>
                <div className='text-[12px] text-muted'>{t('lot.status')}</div>
                <div className='text-[15px] leading-snug font-semibold'>{t('room.closed')}</div>
              </>
            ) : (
              <>
                <div className='text-[12px] text-muted'>{live ? t('lot.endsIn') : t('lot.opensIn')}</div>
                <div className={`tabular text-lg font-bold min-[360px]:text-xl ${live ? 'text-hot' : ''}`}>
                  {formatCountdown((live ? closes : opens) - now, t('time.d'))}
                </div>
              </>
            )}
          </div>
        </div>

        {!native && !closed && (!admitted || live) && (
          <div className={cn(ACTION_BAR, 'lg:static lg:z-auto lg:border-0 lg:bg-transparent lg:p-0')}>
            <Button
              onClick={primary}
              disabled={!admitted && blocked}
              className='mx-auto flex w-full max-w-lg lg:max-w-none'
            >
              {ctaText}
            </Button>
          </div>
        )}

        {/* Победителю — что делать дальше (10% / код выдачи / остаток), прямо на странице лота */}
        {purchase && <PurchaseCard p={purchase} showTitle={false} />}
        {left && (
          <p role='status' className='rounded-2xl border border-ok/30 px-4 py-3 text-[14px] font-medium text-ok'>
            ✓ {t(left === 'carried' ? 'lot.leave.carried.done' : 'lot.leave.done')}
          </p>
        )}

        {!live && !closed && <RemindCard lotId={lot.id} opensAt={opens} now={now} />}

        <RelistNotice lot={lot} />

        {admitted && carriedInfo?.carried && !live && opens > now ? (
          <CarriedCard info={carriedInfo} opensAt={opens} />
        ) : (
          admitted && (
            <div className='rounded-2xl border border-ok/30 px-4 py-3 text-[14px] font-medium text-ok'>
              ✓ {t('lot.admittedBadge')}
            </div>
          )
        )}
        {admitted && !live && opens > now && (
          <LeaveCard
            lotId={lot.id}
            carried={Boolean(carriedInfo?.carried)}
            onLeft={() => setLeft(carriedInfo?.carried ? 'carried' : 'refund')}
          />
        )}

        <section className='divide-y divide-line'>
          <Row label={t('lot.start')}>
            <Price value={lot.startPrice} />
          </Row>
          <Row label={t('lot.step')}>
            <Price value={lot.step} />
          </Row>
          <Row label={t('lot.admitted')}>
            {participantsOf(lot)}
            {lot.maxParticipants ? ` ${t('lot.of')} ${lot.maxParticipants}` : ''}
          </Row>
          <Row label={t('lot.participation')}>
            <span className='font-medium text-ok'>{t('lot.free')}</span>
          </Row>
        </section>

        {attributes.length > 0 && (
          <section className='grid gap-2'>
            <h2 className='text-[15px] font-semibold'>{t('lot.attributes')}</h2>
            <div className='divide-y divide-line'>
              {attributes.map((a) => (
                <Row key={a.key} label={locale === 'uz' ? a.labelUz : a.labelRu}>
                  {attributeText(a, t, locale)}
                </Row>
              ))}
            </div>
          </section>
        )}

        {(deviceAct || lot.inspection.summary || lot.inspection.kit.length > 0 || lot.inspection.defects.length > 0) && (
          <section className='grid gap-2'>
            <h2 className='text-[15px] font-semibold'>{t(deviceAct ? 'lot.inspection' : 'lot.state')}</h2>
            {lot.inspection.summary && <p className='text-[14px] leading-relaxed'>{lot.inspection.summary}</p>}
            <div className='divide-y divide-line'>
              {deviceAct && lot.inspection.battery !== null && (
                <Row label={t('lot.battery')}>{lot.inspection.battery}%</Row>
              )}
              {deviceAct && <Row label='IMEI'>{lot.inspection.imeiChecked ? '✓' : '—'}</Row>}
              {lot.inspection.kit.length > 0 && (
                <Row stacked label={t('lot.kit')}>
                  {lot.inspection.kit.join(', ')}
                </Row>
              )}
              <Row stacked label={t('lot.defects')}>
                {lot.inspection.defects.length ? lot.inspection.defects.join('; ') : t('lot.noDefects')}
              </Row>
            </div>
          </section>
        )}

        <section className='grid gap-2'>
          <h2 className='text-[15px] font-semibold'>{t('lot.terms')}</h2>
          <p className='text-[13.5px] leading-relaxed text-muted'>{t('lot.terms.text')}</p>
          <div className='divide-y divide-line'>
            <Row stacked label={t('lot.pickup')}>
              {t('lot.pickup.text')}
            </Row>
          </div>
        </section>
      </div>

      {sheet && (
        <AdmissionSheet
          lot={lot}
          onClose={() => {
            setSheet(false)
            setDismissed(true)
          }}
          onPaid={() => {
            setSheet(false)
            setDismissed(true)
            // Короткий путь: после допуска к идущему лоту — сразу в комнату торгов.
            if (live)
              navigate({
                to: '/lot/$lotId/room',
                params: { lotId: lot.id },
                replace: true,
              })
          }}
        />
      )}
    </div>
  )
}

export const Route = createFileRoute('/lot/$lotId/')({
  validateSearch: (s: Record<string, unknown>): { admit?: boolean } =>
    s.admit === true || s.admit === 'true' ? { admit: true } : {},
  component: LotPage,
})

/** Значение характеристики — только текст (без HTML); да/нет и дата — по языку покупателя. */
function attributeText(
  a: NonNullable<Lot['attributes']>[number],
  t: (k: 'lot.yes' | 'lot.no') => string,
  locale: 'ru' | 'uz'
): string {
  if (a.type === 'boolean') return t(a.value === true ? 'lot.yes' : 'lot.no')
  if (a.type === 'date' && typeof a.value === 'string') {
    const [y, m, d] = a.value.split('-')
    return `${d}.${m}.${y}`
  }
  if (a.type === 'number' && typeof a.value === 'number') return a.value.toLocaleString(locale === 'uz' ? 'uz-UZ' : 'ru-RU')
  return String(a.value)
}
