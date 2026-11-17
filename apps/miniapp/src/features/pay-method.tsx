import { Check } from 'lucide-react'
import { useI18n } from '@/app/i18n'
import { payMethodName } from '@/entities/payment/api'
import { cn } from '@/shared/lib/cn'
// Официальные логотипы для кнопок оплаты: Payme — developer.help.paycom.uz «Ресурсы», Click — docs.click.uz.
import clickIcon from '@/shared/ui/brand/click.svg'
import paymeLogo from '@/shared/ui/brand/payme.svg'

function MethodLogo({ m }: { m: string }) {
  if (m === 'payme') return <img src={paymeLogo} alt='' className='h-5 w-auto' />
  if (m === 'click')
    return (
      <span className='inline-flex items-center gap-1.5'>
        <img src={clickIcon} alt='' className='size-5' />
        Click
      </span>
    )
  return <>{payMethodName(m)}</>
}

/** Выбор Click / Payme перед оплатой. Один способ (или ни одного) — выбора нет, ничего не показываем. */
export function PayMethodChoice({
  methods,
  value,
  onChange,
  className,
}: {
  methods: string[]
  value: string | undefined
  onChange: (m: string) => void
  className?: string
}) {
  const { t } = useI18n()
  if (methods.length < 2) return null
  return (
    <fieldset className={cn('grid gap-2', className)}>
      <legend className='mb-2 text-[13px] text-muted'>{t('pay.method')}</legend>
      <div className='grid grid-cols-2 gap-2' role='radiogroup'>
        {methods.map((m) => (
          <button
            key={m}
            type='button'
            role='radio'
            aria-checked={value === m}
            aria-label={payMethodName(m)}
            onClick={() => onChange(m)}
            className={cn(
              'inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border px-3 text-[15px] font-semibold transition-colors',
              value === m ? 'border-primary bg-primary/10 text-brand-ink ring-1 ring-primary' : 'border-line bg-surface text-fg'
            )}
          >
            {value === m && <Check className='size-4' aria-hidden='true' />}
            <MethodLogo m={m} />
          </button>
        ))}
      </div>
    </fieldset>
  )
}
