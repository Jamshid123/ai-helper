import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { CheckCircle2, Clock, PackageCheck, XCircle } from 'lucide-react'
import { useI18n } from '@/app/i18n'
import { haptic } from '@/app/platform'
import { type Purchase, usePayPurchase } from '@/entities/purchase/api'
import { errorText } from '@/shared/api/error-text'
import { formatSessionDate } from '@/shared/lib/format-date'
import { formatCountdown, useNow } from '@/shared/lib/use-now'
import { Button } from '@/shared/ui/button'
import { Price } from '@/shared/ui/price'

/**
 * Выигранный лот (решения 14.11 и 16.11.2026): оплатить 10% за 15 минут → код выдачи и 24 часа,
 * чтобы оплатить остаток (онлайн или на месте) и забрать товар.
 */
export function PurchaseCard({ p, showTitle = true }: { p: Purchase; showTitle?: boolean }) {
  const { t, locale } = useI18n()
  const now = useNow()
  const pay = usePayPurchase()
  const [pending, setPending] = useState<'prepayment' | 'remainder' | null>(null)
  const [error, setError] = useState<string | null>(null)

  const run = (part: 'prepayment' | 'remainder') => {
    if (pending) return
    setPending(part)
    setError(null)
    pay(p.id, part)
      .then(
        () => haptic('success'),
        (e: unknown) => {
          haptic('error')
          setError(errorText(t, e))
        }
      )
      .finally(() => setPending(null))
  }

  const title = showTitle && (
    <Link to='/lot/$lotId' params={{ lotId: p.lotId }} className='text-[15px] leading-snug font-semibold'>
      {p.lotTitle}
    </Link>
  )

  if (p.status === 'AWAITING_PREPAYMENT' && p.prepaymentDeadline) {
    const left = new Date(p.prepaymentDeadline).getTime() - now
    return (
      <section className='grid gap-3 rounded-2xl border-2 border-primary bg-primary/5 p-4' aria-live='polite'>
        <span className='inline-flex items-center gap-1.5 text-[13px] font-semibold text-brand-ink'>
          <CheckCircle2 className='size-4' aria-hidden='true' /> {t('buy.won')}
        </span>
        {title}
        <div className='flex flex-wrap items-end justify-between gap-3'>
          <div className='grid gap-0.5'>
            <span className='text-[12.5px] text-muted'>{t('buy.pay10')}</span>
            <Price value={BigInt(p.prepaymentAmount)} className='text-[22px] leading-none font-bold' />
            <span className='text-[12.5px] text-muted'>
              {t('buy.ofPrice')} <Price value={BigInt(p.amount)} />
            </span>
          </div>
          <div className='grid justify-items-end gap-0.5'>
            <span className='text-[12.5px] text-muted'>{t('buy.left')}</span>
            <span className='tabular text-[20px] font-bold text-hot-text'>
              {formatCountdown(Math.max(0, left), t('time.d'))}
            </span>
          </div>
        </div>
        <Button onClick={() => run('prepayment')} disabled={pending !== null || left <= 0} className='w-full'>
          {t('buy.pay10.cta')} <Price value={BigInt(p.prepaymentAmount)} />
        </Button>
        <p className='text-[12.5px] text-muted'>{t('buy.pay10.warn')}</p>
        {error && (
          <p role='alert' className='text-[13px] font-medium text-hot-text'>
            {error}
          </p>
        )}
      </section>
    )
  }

  if (p.status === 'AWAITING_PICKUP' && p.remainderDeadline) {
    const until = formatSessionDate(new Date(p.remainderDeadline), locale)
    return (
      <section className='grid gap-3 rounded-2xl border border-line p-4'>
        <span className='inline-flex items-center gap-1.5 text-[13px] font-semibold text-ok'>
          <Clock className='size-4' aria-hidden='true' /> {t('buy.pickup.title').replace('{until}', until)}
        </span>
        {title}
        <div className='grid justify-items-center gap-1 rounded-xl bg-surface py-4'>
          <span className='text-[12.5px] text-muted'>{t('buy.code')}</span>
          <span className='tabular text-[32px] leading-none font-bold tracking-[0.25em]'>{p.pickupCode}</span>
          <span className='px-4 text-center text-[12px] text-muted'>{t('buy.code.hint')}</span>
        </div>
        <div className='flex items-baseline justify-between gap-3 text-[14px]'>
          <span className='text-muted'>{t('buy.remainder')}</span>
          {p.remainderPaid ? (
            <span className='font-semibold text-ok'>✓ {t('buy.remainder.paid')}</span>
          ) : (
            <Price value={BigInt(p.remainderAmount)} className='font-semibold' />
          )}
        </div>
        {!p.remainderPaid && (
          <>
            <Button onClick={() => run('remainder')} disabled={pending !== null} variant='ghost' className='w-full'>
              {t('buy.remainder.online')}
            </Button>
            <p className='text-[12.5px] text-muted'>{t('buy.remainder.onsite')}</p>
          </>
        )}
        <p className='text-[12.5px] text-muted'>
          {t('lot.pickup')}: {t('lot.pickup.text')}
        </p>
        {error && (
          <p role='alert' className='text-[13px] font-medium text-hot-text'>
            {error}
          </p>
        )}
      </section>
    )
  }

  if (p.status === 'COMPLETED') {
    return (
      <section className='flex items-center gap-3 rounded-2xl border border-line p-4'>
        <PackageCheck className='size-6 shrink-0 text-ok' aria-hidden='true' />
        <div className='grid gap-0.5'>
          {title}
          <span className='text-[13px] text-muted'>{t('buy.completed')}</span>
        </div>
      </section>
    )
  }

  if (p.status === 'EXPIRED') {
    return (
      <section className='flex items-start gap-3 rounded-2xl border border-line p-4'>
        <XCircle className='mt-0.5 size-5 shrink-0 text-muted' aria-hidden='true' />
        <div className='grid gap-0.5'>
          {title}
          <span className='text-[13px] text-muted'>
            {t(p.expiredReason === 'PICKUP_MISSED' ? 'buy.expired.pickup' : 'buy.expired.prepayment')}
          </span>
        </div>
      </section>
    )
  }
  return null
}
