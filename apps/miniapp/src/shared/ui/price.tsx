import { formatSum } from '@auksion/shared'
import { useI18n } from '@/app/i18n'
import { cn } from '@/shared/lib/cn'

/** Сумма в сумах: число крупно, валюта мельче — чтобы крупные цены помещались в карточки. */
export function Price({ value, className }: { value: string | bigint; className?: string }) {
  const { locale } = useI18n()
  return (
    <span className={cn('tabular whitespace-nowrap', className)}>
      {formatSum(value, locale, false)}
      <span className='ml-1 text-[0.62em] font-medium opacity-80'>{locale === 'uz' ? 'soʻm' : 'сум'}</span>
    </span>
  )
}
