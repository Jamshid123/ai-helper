import { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { useI18n } from '@/app/i18n'
import { cn } from '@/shared/lib/cn'
import { LotPhoto } from './lot-photo'

/** Лента фото со свайпом и привязкой к кадру; номер текущего фото считается по прокрутке. */
function Strip({
  photos,
  alt,
  fit,
  start = 0,
  onIndex,
  onTap,
  className,
}: {
  photos: string[]
  alt: string
  fit: 'cover' | 'contain'
  start?: number
  onIndex: (i: number) => void
  onTap?: () => void
  className?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current
    if (el && start) el.scrollLeft = start * el.clientWidth
  }, [start])
  return (
    <div
      ref={ref}
      className={cn(
        'flex snap-x snap-mandatory overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
        className
      )}
      onScroll={(e) => {
        const el = e.currentTarget
        onIndex(Math.round(el.scrollLeft / Math.max(1, el.clientWidth)))
      }}
    >
      {photos.map((src, i) => (
        <button
          key={`${i}-${src}`}
          type='button'
          onClick={onTap}
          className='w-full shrink-0 snap-center'
          aria-label={`${alt} ${i + 1}/${photos.length}`}
          tabIndex={onTap ? 0 : -1}
        >
          <img
            src={src}
            alt=''
            loading={i === 0 ? 'eager' : 'lazy'}
            draggable={false}
            className={cn('h-full w-full', fit === 'cover' ? 'object-cover' : 'object-contain')}
          />
        </button>
      ))}
    </div>
  )
}

/**
 * Карусель фото товара (видна всем, в т.ч. до допуска — решение 14.11.2026).
 * Свайп листает, касание открывает фото на весь экран. Без фото — прежняя заглушка.
 */
export function PhotoCarousel({
  photos,
  hue,
  title,
  className,
  children,
}: {
  photos: string[]
  hue: number
  title: string
  className?: string
  children?: React.ReactNode
}) {
  const { t } = useI18n()
  const [i, setI] = useState(0)
  const [full, setFull] = useState(false)
  useEffect(() => {
    if (!full) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setFull(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [full])

  if (photos.length === 0)
    return (
      <LotPhoto hue={hue} className={className}>
        {children}
      </LotPhoto>
    )

  const counter = photos.length > 1 && (
    <span className='tabular pointer-events-none absolute right-3 bottom-3 rounded-full bg-black/55 px-2.5 py-1 text-[12px] font-medium text-white'>
      {i + 1} / {photos.length}
    </span>
  )

  return (
    <>
      <div className={cn('relative overflow-hidden rounded-2xl bg-surface', className)}>
        <Strip photos={photos} alt={title} fit='cover' onIndex={setI} onTap={() => setFull(true)} className='h-full' />
        {children}
        {counter}
        {photos.length > 1 && (
          <div
            className='pointer-events-none absolute inset-x-0 bottom-3 flex justify-center gap-1.5'
            aria-hidden='true'
          >
            {photos.map((src, k) => (
              <span key={`${k}-${src}`} className={cn('size-1.5 rounded-full', k === i ? 'bg-white' : 'bg-white/50')} />
            ))}
          </div>
        )}
      </div>

      {full && (
        <div role='dialog' aria-modal='true' aria-label={title} className='fixed inset-0 z-50 flex flex-col bg-black'>
          <div className='flex items-center justify-between px-2 pt-[env(safe-area-inset-top,0px)]'>
            <span className='tabular px-2 text-[14px] text-white/80'>
              {photos.length > 1 ? `${i + 1} / ${photos.length}` : ''}
            </span>
            <button
              type='button'
              onClick={() => setFull(false)}
              aria-label={t('photos.close')}
              className='grid size-11 place-items-center text-white'
            >
              <X className='size-6' />
            </button>
          </div>
          <Strip photos={photos} alt={title} fit='contain' start={i} onIndex={setI} className='flex-1' />
        </div>
      )}
    </>
  )
}
