import { useState } from 'react'
import { Zap } from 'lucide-react'
import { formatSum } from '@auksion/shared'
import { useI18n } from '@/app/i18n'
import { haptic } from '@/app/telegram'
import { useAutoBid } from '@/entities/lot/api'
import { Price } from '@/shared/ui/price'

/** Автопредложение до максимума (proxy bidding). В Telegram — на сервере, в демо — против «других участников». */
export function AutoBidCard({ lotId, minBid, step }: { lotId: string; minBid: bigint; step: bigint }) {
  const { t, locale } = useI18n()
  const { max: active, set } = useAutoBid(lotId)
  const [busy, setBusy] = useState(false)
  const run = (next: bigint | null) => {
    setBusy(true)
    set(next)
      .then(
        () => haptic('success'),
        () => haptic('error')
      )
      .finally(() => setBusy(false))
  }
  const suggested = minBid + step * 5n
  const [value, setValue] = useState(formatSum(suggested, locale, false))
  const digits = value.replace(/\D/g, '')
  const max = digits ? BigInt(digits) : 0n
  const valid = max >= minBid

  if (active !== null) {
    const exhausted = active < minBid
    return (
      <section className='flex items-center justify-between gap-3 rounded-2xl border border-line px-4 py-3'>
        <span className='flex min-w-0 items-center gap-2 text-[14px]'>
          <Zap className='size-4 shrink-0 text-brand-ink' aria-hidden='true' />
          {exhausted ? (
            <span className='text-hot-text'>{t('auto.exhausted')}</span>
          ) : (
            <span>
              {t('auto.active')} <Price value={active} className='font-semibold' />
            </span>
          )}
        </span>
        <button
          type='button'
          disabled={busy}
          onClick={() => run(null)}
          className='min-h-11 shrink-0 px-2 text-[13px] text-muted underline underline-offset-4'
        >
          {t('auto.off')}
        </button>
      </section>
    )
  }

  return (
    <section className='grid gap-2 rounded-2xl border border-line px-4 py-3'>
      <h2 className='flex items-center gap-2 text-[15px] font-semibold'>
        <Zap className='size-4 text-brand-ink' aria-hidden='true' /> {t('auto.title')}
      </h2>
      <p className='text-[13px] leading-snug text-muted'>{t('auto.text')}</p>
      <div className='flex gap-2'>
        <label htmlFor='autoMax' className='sr-only'>
          {t('auto.max')}
        </label>
        <input
          id='autoMax'
          inputMode='numeric'
          value={value}
          onChange={(e) => setValue(formatSum(e.target.value.replace(/\D/g, '') || '0', locale, false))}
          className='tabular h-11 min-w-0 flex-1 rounded-xl border border-line bg-bg px-3 text-[16px] outline-none focus:border-primary'
        />
        <button
          type='button'
          disabled={!valid || busy}
          onClick={() => run(max)}
          className='h-11 shrink-0 rounded-xl bg-fg px-4 text-[14px] font-semibold text-bg disabled:bg-surface disabled:text-muted'
        >
          {t('auto.enable')}
        </button>
      </div>
    </section>
  )
}
