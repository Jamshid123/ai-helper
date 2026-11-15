import { cn } from '@/shared/lib/cn'

/**
 * Логотип AuksionGO (выбран заказчиком 15.11.2026): знак «ступени» — цена, которая только растёт.
 * Название одним цветом, «GO» выделено только толщиной (двухцветное название давало лишнюю ассоциацию).
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox='0 0 24 24' aria-hidden='true' className={cn('size-6 shrink-0', className)}>
      <rect width='24' height='24' rx='6' fill='#F97216' />
      <path
        d='M5 17h4v-4h4V9h4V5'
        fill='none'
        stroke='#fff'
        strokeWidth='2.4'
        strokeLinecap='round'
        strokeLinejoin='round'
      />
    </svg>
  )
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2 text-fg', className)}>
      <LogoMark />
      <span className='text-[18px] leading-none font-semibold tracking-tight'>
        Auksion<b className='font-extrabold'>GO</b>
      </span>
    </span>
  )
}
