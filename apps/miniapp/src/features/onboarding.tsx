import { useCallback, useRef, useState } from 'react'
import { Gavel, ScanSearch, TrendingUp } from 'lucide-react'
import { type TKey, useI18n } from '@/app/i18n'
import { haptic, useBackButton, useMainButton } from '@/app/platform'
import { cn } from '@/shared/lib/cn'
import { Button } from '@/shared/ui/button'
import { finishOnboarding as finish } from './onboarding-store'

/**
 * Онбординг при первом входе (тексты заказчика 14.11.2026): 3 экрана-истории,
 * «Пропустить» всегда, повторно — «Как это работает» в профиле.
 * Показывается один раз на устройстве (localStorage).
 */
const SLIDES: { title: TKey; text: TKey; Icon: typeof Gavel }[] = [
  { title: 'onb.1.title', text: 'onb.1.text', Icon: Gavel },
  { title: 'onb.2.title', text: 'onb.2.text', Icon: ScanSearch },
  { title: 'onb.3.title', text: 'onb.3.text', Icon: TrendingUp },
]

export function Onboarding() {
  const { t, locale, setLocale } = useI18n()
  const [i, setI] = useState(0)
  const last = i === SLIDES.length - 1
  const slide = SLIDES[i]
  const startX = useRef<number | null>(null)
  const swiped = useRef(false)

  const go = useCallback((to: number) => {
    if (to < 0) return
    if (to >= SLIDES.length) {
      haptic('success')
      finish()
      return
    }
    haptic('tap')
    setI(to)
  }, [])
  const next = useCallback(() => go(i + 1), [go, i])
  const back = useCallback(() => go(i - 1), [go, i])

  const native = useMainButton({ text: t(last ? 'onb.start' : 'onb.next'), onClick: next })
  useBackButton(i > 0 ? back : null)

  return (
    <section
      aria-label={t('howto.title')}
      className='mx-auto flex min-h-svh max-w-lg flex-col bg-bg px-5 pt-[calc(env(safe-area-inset-top,0px)+12px)] pb-[calc(env(safe-area-inset-bottom,0px)+16px)] select-none'
      onKeyDown={(e) => {
        if (e.key === 'ArrowRight') next()
        if (e.key === 'ArrowLeft') back()
      }}
    >
      {/* прогресс историй */}
      <div className='grid grid-cols-3 gap-1.5' aria-hidden='true'>
        {SLIDES.map((s, k) => (
          <span key={s.title} className={cn('h-1 rounded-full', k <= i ? 'bg-primary' : 'bg-surface')} />
        ))}
      </div>

      <div className='mt-3 flex min-h-11 items-center justify-between'>
        {i === 0 ? (
          <div className='flex gap-1 rounded-xl bg-surface p-1' role='group' aria-label={t('me.language')}>
            {(['ru', 'uz'] as const).map((l) => (
              <button
                key={l}
                type='button'
                aria-pressed={locale === l}
                onClick={() => setLocale(l)}
                className={cn(
                  'h-9 min-w-11 rounded-lg px-3 text-[13px]',
                  locale === l ? 'bg-bg font-semibold shadow-sm' : 'text-muted'
                )}
              >
                {l === 'ru' ? 'RU' : 'UZ'}
              </button>
            ))}
          </div>
        ) : (
          <span />
        )}
        {!last && (
          <button type='button' onClick={finish} className='-mr-2 min-h-11 px-2 text-[14px] text-muted'>
            {t('onb.skip')}
          </button>
        )}
      </div>

      {/* касание слева — назад, справа — вперёд; свайп — так же */}
      <div
        className='flex flex-1 cursor-pointer flex-col items-center justify-center gap-6 text-center'
        onClick={(e) => {
          if (swiped.current) {
            swiped.current = false // свайп уже перелистнул
            return
          }
          const r = e.currentTarget.getBoundingClientRect()
          if (e.clientX - r.left < r.width / 3) back()
          else next()
        }}
        onPointerDown={(e) => {
          startX.current = e.clientX
        }}
        onPointerUp={(e) => {
          if (startX.current === null) return
          const dx = e.clientX - startX.current
          startX.current = null
          if (Math.abs(dx) > 48) {
            swiped.current = true
            if (dx < 0) next()
            else back()
          }
        }}
      >
        <div className='grid size-32 place-items-center rounded-full bg-primary/12' aria-hidden='true'>
          <slide.Icon className='size-14 text-brand-ink' strokeWidth={1.6} />
        </div>
        <div className='grid gap-3' aria-live='polite'>
          <h1 className='text-[26px] leading-tight font-bold text-balance'>{t(slide.title)}</h1>
          <p className='mx-auto max-w-80 text-[16px] leading-relaxed text-pretty text-muted'>{t(slide.text)}</p>
        </div>
      </div>

      {!native && (
        <Button onClick={next} className='w-full'>
          {t(last ? 'onb.start' : 'onb.next')}
        </Button>
      )}
    </section>
  )
}
