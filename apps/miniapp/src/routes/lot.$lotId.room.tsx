import { useCallback, useEffect, useState } from 'react'
import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { ChevronLeft, Users } from 'lucide-react'
import { formatSum } from '@auksion/shared'
import { useI18n } from '@/app/i18n'
import { haptic, isInTelegram, useBackButton, useMainButton } from '@/app/telegram'
import { useLot } from '@/entities/lot/api'
import { currentPrice, roomMinBid } from '@/entities/lot/engine'
import { demoOnline, demoPlaceBid, getRoom, isAdmitted, startBots, useDemoVersion } from '@/entities/lot/demo-store'
import { cn } from '@/shared/lib/cn'
import { formatCountdown, useNow } from '@/shared/lib/use-now'
import { Button } from '@/shared/ui/button'
import { LiveBadge } from '@/shared/ui/live-badge'
import { Price } from '@/shared/ui/price'

/** Сколько шагов добавить к минимальной цене: варианты быстрого выбора. */
const STEP_OPTIONS = [0n, 1n, 2n, 5n] as const

function RoomPage() {
  const { lotId } = Route.useParams()
  const { t, locale } = useI18n()
  const navigate = useNavigate()
  const now = useNow()
  useDemoVersion()
  const { data: lot } = useLot(lotId)
  const back = useCallback(() => navigate({ to: '/lot/$lotId', params: { lotId } }), [navigate, lotId])
  useBackButton(back)
  useEffect(() => startBots(lotId), [lotId])

  const room = getRoom(lotId)
  const min = roomMinBid(room)
  const price = currentPrice(room)
  const last = room.bids.at(-1)
  const iLead = Boolean(last?.isMe)
  const iBid = room.bids.some((b) => b.isMe)
  const closed = now >= room.closesAt
  const admitted = isAdmitted(lotId)
  const [extra, setExtra] = useState(0n)
  // Если пока выбирали, цену перебили — выбор пересчитывается от новой минимальной.
  const amount = min + extra * room.step
  const canOffer = admitted && !closed && !iLead

  const offer = () => {
    const r = demoPlaceBid(lotId, amount)
    haptic(r.ok ? 'success' : 'error')
    setExtra(0n)
  }

  const getAdmission = useCallback(
    () =>
      navigate({
        to: '/lot/$lotId',
        params: { lotId },
        search: { admit: true },
      }),
    [navigate, lotId]
  )

  const native = useMainButton({
    text: !admitted ? t('room.getAdmission') : `${t('room.bid')} ${formatSum(amount, locale)}`,
    onClick: !admitted ? getAdmission : offer,
    visible: !closed && (!admitted || canOffer),
  })

  if (!lot) return null

  const banner = closed
    ? { text: t('room.closed'), cls: 'bg-surface text-muted' }
    : !admitted
      ? { text: t('room.notAdmitted'), cls: 'bg-surface text-fg' }
      : iLead
        ? { text: t('room.youLead'), cls: 'bg-ok/10 text-ok' }
        : iBid
          ? { text: t('room.outbid'), cls: 'bg-hot/10 text-hot' }
          : null

  const showPanel = !closed && (canOffer || !admitted)

  return (
    <div className={cn('flex flex-col gap-4 px-4 pt-3', showPanel && !native && 'pb-56')}>
      {!isInTelegram() && (
        <Link
          to='/lot/$lotId'
          params={{ lotId }}
          className='-ml-1 inline-flex w-max items-center gap-0.5 text-[14px] text-muted'
        >
          <ChevronLeft className='size-4' /> {t('room.back')}
        </Link>
      )}

      <header className='flex items-start justify-between gap-3'>
        <h1 className='text-[17px] leading-snug font-semibold'>{lot.title}</h1>
        <span className='inline-flex shrink-0 items-center gap-1 text-[12.5px] text-muted'>
          <Users className='size-3.5' /> {demoOnline(lot)}
        </span>
      </header>

      {/* Главное: текущая цена, кто лидирует и сколько осталось */}
      <section className='relative overflow-hidden rounded-2xl bg-surface px-4 pt-9 pb-4'>
        {!closed && <LiveBadge />}
        <div className='flex items-end justify-between gap-3'>
          <div className='grid gap-0.5'>
            <span className='text-[12.5px] text-muted'>{t('lot.current')}</span>
            <Price value={price ?? room.start} className='text-[28px] leading-none font-bold text-brand-ink' />
            <span className='mt-1 text-[13px] text-muted'>
              {t('room.leaderIs')}:{' '}
              <b className='font-semibold text-fg'>{last ? (last.isMe ? t('room.you') : last.bidder) : '—'}</b>
            </span>
          </div>
          <div className='grid justify-items-end gap-0.5'>
            <span className='text-[12.5px] text-muted'>{t('lot.endsIn')}</span>
            <span className='tabular text-[20px] font-bold text-hot'>
              {formatCountdown(room.closesAt - now, t('time.d'))}
            </span>
          </div>
        </div>
      </section>

      {banner && <div className={cn('rounded-xl px-4 py-3 text-[14px] font-medium', banner.cls)}>{banner.text}</div>}

      <section className='grid gap-1'>
        <h2 className='text-[15px] font-semibold'>{t('room.history')}</h2>
        {room.bids.length === 0 ? (
          <p className='text-[14px] text-muted'>{t('room.noBids')}</p>
        ) : (
          <ol className='divide-y divide-line'>
            {[...room.bids].reverse().map((b, i) => (
              <li key={b.seq} className='flex items-baseline justify-between gap-3 py-2.5 text-[14px]'>
                <span className={cn('tabular', b.isMe ? 'font-semibold' : 'text-muted')}>
                  #{b.seq} · {b.isMe ? t('room.you') : b.bidder}
                  {i === 0 && <span className='ml-2 text-[11.5px] text-brand-ink'>{t('room.leader')}</span>}
                </span>
                <Price value={b.amount} className={cn(i === 0 && 'font-semibold')} />
              </li>
            ))}
          </ol>
        )}
      </section>

      {/* Панель действия — внизу, под большим пальцем. В Telegram кнопка нативная (MainButton). */}
      {showPanel && (
        <div
          className={cn(
            'grid gap-3 border-t border-line bg-bg px-4 pt-3',
            native
              ? 'sticky bottom-0 -mx-4 pb-3'
              : 'fixed inset-x-0 bottom-0 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))]'
          )}
        >
          <div className='mx-auto grid w-full max-w-lg gap-3'>
            {canOffer && (
              <>
                <div className='flex items-baseline justify-between text-[13px]'>
                  <span className='text-muted'>{t('room.yourOffer')}</span>
                  <span className='text-muted'>
                    {t('room.minBid')} <Price value={min} className='font-semibold text-fg' />
                  </span>
                </div>
                <div className='grid grid-cols-4 gap-2' role='radiogroup' aria-label={t('room.yourOffer')}>
                  {STEP_OPTIONS.map((n) => {
                    const value = min + n * room.step
                    const active = extra === n
                    return (
                      <button
                        key={n.toString()}
                        type='button'
                        role='radio'
                        aria-checked={active}
                        onClick={() => {
                          setExtra(n)
                          haptic('tap')
                        }}
                        className={cn(
                          'tabular h-11 rounded-xl text-[13px] font-semibold transition-colors',
                          active ? 'bg-fg text-bg' : 'bg-surface text-fg'
                        )}
                      >
                        {formatSum(value, locale, false)}
                      </button>
                    )
                  })}
                </div>
              </>
            )}
            {!native && (
              <Button onClick={admitted ? offer : getAdmission} className='w-full'>
                {admitted ? (
                  <>
                    {t('room.bid')} <Price value={amount} />
                  </>
                ) : (
                  t('room.getAdmission')
                )}
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export const Route = createFileRoute('/lot/$lotId/room')({
  component: RoomPage,
})
