import { useState } from 'react'
import { useI18n } from '@/app/i18n'
import { haptic } from '@/app/telegram'
import { useLeave } from '@/entities/lot/api'
import { errorText } from '@/shared/api/error-text'

/** Выход из лота до начала торгов с полным возвратом (решение 14.11.2026). Второе касание — подтверждение. */
export function LeaveCard({ lotId }: { lotId: string }) {
  const { t } = useI18n()
  const leave = useLeave()
  const [step, setStep] = useState<'idle' | 'confirm' | 'pending'>('idle')
  const [error, setError] = useState<string | null>(null)

  if (step === 'idle') {
    return (
      <button
        type='button'
        onClick={() => {
          setStep('confirm')
          haptic('tap')
        }}
        className='min-h-11 text-left text-[13.5px] text-muted underline underline-offset-4'
      >
        {t('lot.leave')}
      </button>
    )
  }
  return (
    <section className='grid gap-3 rounded-2xl border border-line px-4 py-3' role='alertdialog' aria-live='polite'>
      <p className='text-[14px]'>{t('lot.leave.confirm')}</p>
      {error && <p className='text-[13px] text-hot-text'>{error}</p>}
      <div className='grid grid-cols-2 gap-2'>
        <button
          type='button'
          onClick={() => setStep('idle')}
          className='h-11 rounded-xl bg-surface text-[14px] font-medium'
        >
          {t('admission.cancel')}
        </button>
        <button
          type='button'
          disabled={step === 'pending'}
          onClick={() => {
            setStep('pending')
            setError(null)
            leave(lotId).then(
              () => haptic('success'),
              (e: unknown) => {
                haptic('error')
                setError(errorText(t, e))
                setStep('confirm')
              }
            )
          }}
          className='h-11 rounded-xl bg-fg text-[14px] font-semibold text-bg disabled:opacity-60'
        >
          {t('lot.leave.yes')}
        </button>
      </div>
    </section>
  )
}
