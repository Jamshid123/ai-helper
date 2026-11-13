import { cn } from '@/shared/lib/cn'

/** Заглушка фото: в демо снимков нет. Силуэт телефона на мягком фоне оттенка лота. */
export function LotPhoto({ hue, className, children }: { hue: number; className?: string; children?: React.ReactNode }) {
  return (
    <div className={cn('relative grid place-items-center overflow-hidden rounded-2xl', className)}>
      <div
        className='lot-photo-bg absolute inset-0'
        style={{ background: `linear-gradient(160deg, hsl(${hue} 30% 92%), hsl(${hue} 22% 84%))` }}
      />
      <svg viewBox='0 0 54 88' className='lot-photo-bg relative h-3/5 max-h-28' fill='none' aria-hidden='true'>
        <rect x='2' y='2' width='50' height='84' rx='10' stroke={`hsl(${hue} 18% 40%)`} strokeWidth='3' opacity='.55' />
        <rect x='21' y='7' width='12' height='3' rx='1.5' fill={`hsl(${hue} 18% 40%)`} opacity='.55' />
      </svg>
      {children}
    </div>
  )
}
