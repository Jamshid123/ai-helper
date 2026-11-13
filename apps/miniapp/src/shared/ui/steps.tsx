import { useI18n } from '@/app/i18n'

/** Прогресс пошагового мастера: «Шаг 2 из 3» + полоска. */
export function Steps({ current, total }: { current: number; total: number }) {
  const { t } = useI18n()
  return (
    <div className='grid gap-2'>
      <span className='text-[12.5px] text-muted'>
        {t('reg.step')} {current} {t('reg.of')} {total}
      </span>
      <div className='grid gap-1' style={{ gridTemplateColumns: `repeat(${total}, 1fr)` }} aria-hidden='true'>
        {Array.from({ length: total }, (_, i) => (
          <span key={i} className={`h-1 rounded-full ${i < current ? 'bg-primary' : 'bg-surface'}`} />
        ))}
      </div>
    </div>
  )
}

export function Field({
  id,
  label,
  value,
  onChange,
  inputMode,
  autoComplete,
  placeholder,
}: {
  id: string
  label: string
  value: string
  onChange: (v: string) => void
  inputMode?: React.HTMLAttributes<HTMLInputElement>['inputMode']
  autoComplete?: string
  placeholder?: string
}) {
  return (
    <label htmlFor={id} className='grid gap-1.5'>
      <span className='text-[13px] text-muted'>{label}</span>
      <input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        inputMode={inputMode}
        autoComplete={autoComplete}
        placeholder={placeholder}
        className='h-12 rounded-xl border border-line bg-bg px-3.5 text-[16px] outline-none focus:border-primary'
      />
    </label>
  )
}

export function Check({
  id,
  checked,
  onChange,
  children,
}: {
  id: string
  checked: boolean
  onChange: (v: boolean) => void
  children: React.ReactNode
}) {
  return (
    <label htmlFor={id} className='flex min-h-11 items-start gap-3 text-[14px] leading-snug'>
      <input
        id={id}
        type='checkbox'
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className='mt-0.5 size-5 shrink-0 accent-[var(--primary)]'
      />
      <span>{children}</span>
    </label>
  )
}
