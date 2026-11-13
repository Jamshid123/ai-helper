import { useCallback, useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { BadgeCheck } from 'lucide-react'
import { formatSum } from '@auksion/shared'
import { useI18n } from '@/app/i18n'
import { haptic, useBackButton, useMainButton } from '@/app/telegram'
import { useLot } from '@/entities/lot/api'
import { admit, isAdmitted } from '@/entities/lot/demo-store'
import { type Lot } from '@/entities/lot/types'
import { cn } from '@/shared/lib/cn'
import { formatCountdown, useNow } from '@/shared/lib/use-now'
import { Button } from '@/shared/ui/button'
import { LiveBadge } from '@/shared/ui/live-badge'
import { LotPhoto } from '@/shared/ui/lot-photo'
import { Price } from '@/shared/ui/price'

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className='flex items-baseline justify-between gap-4 py-2.5'>
      <span className='shrink-0 text-[14px] text-muted'>{label}</span>
      <span className='text-right text-[14px]'>{children}</span>
    </div>
  )
}

function AdmissionSheet({ lot, onClose, onPaid }: { lot: Lot; onClose: () => void; onPaid: () => void }) {
  const { t, locale } = useI18n()
  const [agree, setAgree] = useState(false)
  const pay = useCallback(() => {
    if (!agree) return
    // Демо: оплата имитируется. На проде — заказ у платёжного партнёра и подтверждение сервером.
    admit(lot.id)
    haptic('success')
    onPaid()
  }, [agree, lot.id, onPaid])
  const native = useMainButton({
    text: `${t('admission.pay')} ${formatSum(lot.fee, locale)}`,
    onClick: pay,
    enabled: agree,
  })

  return (
    <div className='fixed inset-0 z-20 flex items-end bg-black/40' role='dialog' aria-modal='true' onClick={onClose}>
      <div
        className='mx-auto w-full max-w-lg rounded-t-3xl bg-bg p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom,0px))]'
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className='mb-1 text-lg font-semibold'>{t('admission.title')}</h2>
        <p className='mb-4 text-[14px] text-muted'>{lot.title}</p>
        <div className='mb-4 flex items-baseline justify-between rounded-2xl bg-surface px-4 py-3'>
          <span className='grid'>
            <span className='text-[14px]'>{t('lot.fee')}</span>
            <span className='text-[12px] text-muted'>{t('lot.feeNote')}</span>
          </span>
          <Price value={lot.fee} className='text-lg font-bold' />
        </div>
        <dl className='mb-4 grid gap-2 text-[13px] leading-relaxed'>
          <div>
            <dt className='font-medium'>{t('lot.terms')}</dt>
            <dd className='text-muted'>{t('lot.terms.text')}</dd>
          </div>
          <div>
            <dt className='font-medium'>{t('lot.refund')}</dt>
            <dd className='text-muted'>{t('lot.refund.text')}</dd>
          </div>
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
        <div className='grid grid-cols-2 gap-2'>
          <Button variant='ghost' onClick={onClose}>
            {t('admission.cancel')}
          </Button>
          {!native && (
            <Button onClick={pay} disabled={!agree}>
              {t('admission.pay')} <Price value={lot.fee} />
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

function LotPage() {
  const { lotId } = Route.useParams()
  const { t } = useI18n()
  const navigate = useNavigate()
  const now = useNow()
  const { data: lot } = useLot(lotId)
  const search = Route.useSearch()
  const [sheet, setSheet] = useState(Boolean(search.admit))
  const back = useCallback(() => navigate({ to: '/' }), [navigate])
  useBackButton(sheet ? null : back)

  const admitted = lot ? isAdmitted(lot.id) : false
  const live = lot?.status === 'live'
  const primary = useCallback(() => {
    if (!lot) return
    if (admitted && live) navigate({ to: '/lot/$lotId/room', params: { lotId: lot.id } })
    else if (!admitted) setSheet(true)
  }, [admitted, live, lot, navigate])
  const native = useMainButton({
    text: admitted ? t('lot.toRoom') : t('lot.participate'),
    onClick: primary,
    visible: !sheet && Boolean(lot) && (!admitted || live),
  })

  if (!lot) return null
  const opens = Date.parse(lot.opensAt)
  const closes = Date.parse(lot.closesAt)

  return (
    <div className={cn('flex flex-col gap-4 px-4 pt-4', !native && (!admitted || live) && 'pb-24')}>
      <LotPhoto hue={lot.hue} className='aspect-[4/3]'>
        {live && <LiveBadge />}
      </LotPhoto>

      <div className='grid gap-1.5'>
        <h1 className='text-xl leading-tight font-semibold text-balance'>{lot.title}</h1>
        <div className='flex flex-wrap gap-1.5 text-[12px]'>
          <span className='inline-flex items-center gap-1 rounded-md bg-surface px-2 py-0.5 font-medium text-brand-ink'>
            <BadgeCheck className='size-3.5' /> {t('lot.verified')}
          </span>
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
          <Price value={lot.currentPrice ?? lot.startPrice} className='text-xl font-bold text-brand-ink' />
        </div>
        <div className='rounded-2xl bg-surface px-4 py-3'>
          <div className='text-[12px] text-muted'>{live ? t('lot.endsIn') : t('lot.opensIn')}</div>
          <div className={`tabular text-xl font-bold ${live ? 'text-hot' : ''}`}>
            {formatCountdown((live ? closes : opens) - now, t('time.d'))}
          </div>
        </div>
      </div>

      {admitted && (
        <div className='rounded-2xl border border-ok/30 px-4 py-3 text-[14px] font-medium text-ok'>
          ✓ {t('lot.admittedBadge')}
        </div>
      )}

      <section className='divide-y divide-line'>
        <Row label={t('lot.start')}>
          <Price value={lot.startPrice} />
        </Row>
        <Row label={t('lot.step')}>
          <Price value={lot.step} />
        </Row>
        <Row label={t('lot.admitted')}>{lot.admittedCount}</Row>
        <Row label={t('lot.fee')}>
          <Price value={lot.fee} />
        </Row>
      </section>

      <section className='grid gap-2'>
        <h2 className='text-[15px] font-semibold'>{t('lot.inspection')}</h2>
        <p className='text-[14px] leading-relaxed'>{lot.inspection.summary}</p>
        <div className='divide-y divide-line'>
          {lot.inspection.battery !== null && <Row label={t('lot.battery')}>{lot.inspection.battery}%</Row>}
          <Row label='IMEI'>{lot.inspection.imeiChecked ? '✓' : '—'}</Row>
          <Row label={t('lot.kit')}>{lot.inspection.kit.join(', ')}</Row>
          <Row label={t('lot.defects')}>
            {lot.inspection.defects.length ? lot.inspection.defects.join('; ') : t('lot.noDefects')}
          </Row>
        </div>
      </section>

      <section className='grid gap-2'>
        <h2 className='text-[15px] font-semibold'>{t('lot.terms')}</h2>
        <p className='text-[13.5px] leading-relaxed text-muted'>{t('lot.terms.text')}</p>
        <div className='divide-y divide-line'>
          <Row label={t('lot.refund')}>{t('lot.refund.text')}</Row>
          <Row label={t('lot.pickup')}>{t('lot.pickup.text')}</Row>
        </div>
      </section>

      {!native && (!admitted || live) && (
        <div className='fixed inset-x-0 bottom-0 z-10 border-t border-line bg-bg px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))]'>
          <Button onClick={primary} className='mx-auto flex w-full max-w-lg'>
            {admitted ? t('lot.toRoom') : t('lot.participate')}
          </Button>
        </div>
      )}

      {sheet && (
        <AdmissionSheet
          lot={lot}
          onClose={() => setSheet(false)}
          onPaid={() => {
            setSheet(false)
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
