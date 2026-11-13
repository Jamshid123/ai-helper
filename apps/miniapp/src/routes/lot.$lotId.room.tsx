import { useCallback, useEffect, useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useI18n } from '@/app/i18n'
import { haptic, useBackButton, useMainButton } from '@/app/telegram'
import { useLot } from '@/entities/lot/api'
import { currentPrice, roomMinBid } from '@/entities/lot/engine'
import {
  demoOnline,
  demoPlaceBid,
  getRoom,
  isAdmitted,
  startBots,
  useDemoVersion,
} from '@/entities/lot/demo-store'
import { cn } from '@/shared/lib/cn'
import { formatCountdown, useNow } from '@/shared/lib/use-now'
import { Button } from '@/shared/ui/button'
import { Price } from '@/shared/ui/price'

function RoomPage() {
  const { lotId } = Route.useParams()
  const { t } = useI18n()
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
  const amount = min + extra * room.step

  const bid = useCallback(() => {
    const r = demoPlaceBid(lotId, amount)
    haptic(r.ok ? 'success' : 'error')
    setExtra(0n)
  }, [amount, lotId])

  const canBid = admitted && !closed && !iLead
  const native = useMainButton({
    text: `${t('room.bid')} ${amount.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')}`,
    onClick: bid,
    enabled: canBid,
    visible: admitted && !closed,
  })

  if (!lot) return null

  const status = closed
    ? { text: t('room.closed'), cls: 'text-muted' }
    : !admitted
      ? { text: t('room.notAdmitted'), cls: 'text-muted' }
      : iLead
        ? { text: t('room.youLead'), cls: 'text-ok' }
        : iBid
          ? { text: t('room.outbid'), cls: 'text-hot' }
          : null

  return (
    <div className='flex flex-col gap-4 px-4 pt-4'>
      <div className='flex items-start justify-between gap-3'>
        <h1 className='text-[17px] leading-snug font-semibold'>{lot.title}</h1>
        <span className='shrink-0 rounded-md bg-surface px-2 py-1 text-[12px] text-muted'>
          {t('room.inRoom')}: {demoOnline(lot)}
        </span>
      </div>

      <div className='grid grid-cols-2 gap-2'>
        <div className='rounded-2xl bg-surface px-4 py-3'>
          <div className='text-[12px] text-muted'>{t('lot.current')}</div>
          <Price value={price ?? room.start} className='text-[22px] font-bold text-brand-ink' />
        </div>
        <div className='rounded-2xl bg-surface px-4 py-3'>
          <div className='text-[12px] text-muted'>{t('lot.endsIn')}</div>
          <div className='tabular text-[22px] font-bold text-hot'>{formatCountdown(room.closesAt - now, t('time.d'))}</div>
        </div>
      </div>

      {status && (
        <div className={cn('rounded-2xl border border-line px-4 py-3 text-[14px] font-medium', status.cls)}>
          {status.text}
        </div>
      )}

      {admitted && !closed && (
        <div className='grid gap-2'>
          <div className='flex items-baseline justify-between text-[14px]'>
            <span className='text-muted'>{t('room.minBid')}</span>
            <Price value={min} className='font-semibold' />
          </div>
          <div className='grid grid-cols-4 gap-2'>
            {[0n, 1n, 2n, 5n].map((n) => (
              <button
                key={n.toString()}
                type='button'
                onClick={() => {
                  setExtra(n)
                  haptic('tap')
                }}
                className={cn(
                  'h-10 rounded-xl text-[13px] font-medium',
                  extra === n ? 'bg-fg text-bg' : 'bg-surface text-fg'
                )}
              >
                {n === 0n ? t('room.min') : `+${n} ${t('lot.step').toLowerCase()}`}
              </button>
            ))}
          </div>
          {!native && (
            <Button onClick={bid} disabled={!canBid}>
              {t('room.bid')} <Price value={amount} />
            </Button>
          )}
        </div>
      )}

      <section className='grid gap-1'>
        <h2 className='text-[15px] font-semibold'>{t('room.history')}</h2>
        {room.bids.length === 0 ? (
          <p className='text-[14px] text-muted'>{t('room.noBids')}</p>
        ) : (
          <ol className='divide-y divide-line'>
            {[...room.bids].reverse().map((b, i) => (
              <li key={b.seq} className='flex items-baseline justify-between py-2.5 text-[14px]'>
                <span className={cn('tabular', b.isMe ? 'font-semibold' : 'text-muted')}>
                  #{b.seq} · {b.isMe ? t('room.you') : b.bidder}
                  {i === 0 && <span className='ml-2 text-[11px] text-brand-ink'>{t('room.leader')}</span>}
                </span>
                <Price value={b.amount} className={cn(i === 0 && 'font-semibold')} />
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  )
}

export const Route = createFileRoute('/lot/$lotId/room')({ component: RoomPage })
