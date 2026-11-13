import { type SVGProps } from 'react'
import { cn } from '@/lib/utils'

/** Знак Auksion: ступени — цена, которая только растёт. */
export function Logo({ className, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox='0 0 24 24'
      xmlns='http://www.w3.org/2000/svg'
      height='24'
      width='24'
      fill='none'
      className={cn('size-6', className)}
      {...props}
    >
      <title>Auksion</title>
      <rect width='24' height='24' rx='6' fill='var(--primary)' />
      <path
        d='M5 17h4v-4h4V9h4V5'
        stroke='var(--primary-foreground)'
        strokeWidth='2.2'
        strokeLinecap='round'
        strokeLinejoin='round'
      />
    </svg>
  )
}
