import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { type TKey, useI18n } from '@/app/i18n'
import { type AdmissionInfo, DEMO, useAdmissions, useLots } from '@/entities/lot/api'
import { usePurchases } from '@/entities/purchase/api'
import { PurchaseCard } from '@/features/purchase-card'
import { formatSessionDate } from '@/shared/lib/format-date'
import { groupMyLots, isEmpty } from './group'

/**
 * «Мои лоты» (решение 18.11.2026): всё, что связано с моими торгами, — в одном месте профиля.
 * Порядок: что нужно сделать → идут сейчас → предстоящие → история (свёрнута).
 */
export function MyLots() {
  const { t } = useI18n()
  const admissions = useAdmissions()
  const purchases = usePurchases()
  const { data: lots = [] } = useLots()
  // демо-режим: в допуске только id — название, время и состояние берём из каталога
  const list = DEMO
    ? admissions.list.map((a) => {
        const l = lots.find((x) => x.id === a.lotId)
        return l ? { ...a, title: l.title, opensAt: l.opensAt, status: l.status === 'live' ? 'LIVE' : l.status === 'closed' ? 'CLOSED_SOLD' : 'SCHEDULED' } : a
      })
    : admissions.list
  const g = groupMyLots(list, purchases)
  const [showHistory, setShowHistory] = useState(false)

  return (
    <section className='grid gap-4' aria-labelledby='my-lots' id='purchases'>
      <h2 id='my-lots' className='text-[17px] font-semibold'>
        {t('mylots.title')}
      </h2>

      {isEmpty(g) && (
        <div className='grid justify-items-start gap-3 rounded-2xl border border-line p-4'>
          <p className='text-[14px] text-muted'>{t('mylots.empty')}</p>
          <Link to='/' className='text-[14px] font-semibold text-brand-ink underline underline-offset-4'>
            {t('mylots.toCatalog')}
          </Link>
        </div>
      )}

      {(g.action.purchases.length > 0 || g.action.confirm.length > 0) && (
        <Group title={t('mylots.action')}>
          {g.action.purchases.map((p) => (
            <PurchaseCard key={p.id} p={p} />
          ))}
          {g.action.confirm.map((a) => (
            <AdmissionRow key={a.lotId} a={a} note={`${t('relist.badge')} · ${t('mylots.confirm')}`} accent />
          ))}
        </Group>
      )}

      {g.live.length > 0 && (
        <Group title={t('mylots.live')}>
          {g.live.map((a) => (
            <div key={a.lotId} className='flex items-center gap-3 rounded-2xl border border-line p-4'>
              <Link to='/lot/$lotId' params={{ lotId: a.lotId }} className='min-w-0 flex-1 text-[15px] font-semibold'>
                {a.title}
              </Link>
              <Link
                to='/lot/$lotId/room'
                params={{ lotId: a.lotId }}
                className='inline-flex h-11 shrink-0 items-center rounded-xl bg-primary px-4 text-[14px] font-semibold text-on-primary'
              >
                {t('lot.toRoom')}
              </Link>
            </div>
          ))}
        </Group>
      )}

      {g.upcoming.length > 0 && (
        <Group title={t('mylots.upcoming')}>
          <ul className='divide-y divide-line rounded-2xl border border-line px-4'>
            {g.upcoming.map((a) => (
              <li key={a.lotId}>
                <AdmissionRow a={a} note={t(a.feeStatus === 'CARRIED' ? 'mylots.carried' : 'mylots.feePaid')} bare />
              </li>
            ))}
          </ul>
        </Group>
      )}

      {g.history.length > 0 && (
        <div className='grid gap-2'>
          <button
            type='button'
            aria-expanded={showHistory}
            onClick={() => setShowHistory((v) => !v)}
            className='flex min-h-11 items-center gap-1 self-start text-[14px] text-muted'
          >
            <ChevronDown className={`size-4 transition-transform ${showHistory ? 'rotate-180' : ''}`} aria-hidden='true' />
            {showHistory ? t('mylots.history.hide') : t('mylots.history.show').replace('{n}', String(g.history.length))}
          </button>
          {showHistory && (
            <div className='grid gap-2' aria-label={t('mylots.history')}>
              {g.history.map((h) =>
                h.kind === 'purchase' ? (
                  <PurchaseCard key={h.p.id} p={h.p} />
                ) : (
                  <AdmissionRow key={`a-${h.a.lotId}`} a={h.a} note={t(historyNote(h.a))} />
                )
              )}
            </div>
          )}
        </div>
      )}
    </section>
  )
}

/** Итог по лоту без выкупа. Проигравшему про взнос пока не пишем (решение 18.11.2026 — ждём экспертизу). */
function historyNote(a: AdmissionInfo): TKey {
  if (a.feeStatus === 'REFUND_PENDING') return 'mylots.refundPending'
  if (a.feeStatus === 'REFUNDED') return 'mylots.refunded'
  if (a.status === 'CANCELLED') return 'mylots.cancelled'
  if (a.status === 'UNDER_REVIEW') return 'mylots.review'
  if (a.outcome === 'NOT_WON') return 'mylots.notWon'
  return 'room.closed'
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className='grid gap-2'>
      <h3 className='text-[13px] text-muted'>{title}</h3>
      {children}
    </div>
  )
}

function AdmissionRow({ a, note, accent, bare }: { a: AdmissionInfo; note: string; accent?: boolean; bare?: boolean }) {
  const { t, locale } = useI18n()
  const cancelled = a.status === 'CANCELLED'
  return (
    <Link
      to='/lot/$lotId'
      params={{ lotId: a.lotId }}
      className={bare ? 'flex items-center gap-3 py-3' : 'flex items-center gap-3 rounded-2xl border border-line px-4 py-3'}
    >
      <span className='grid min-w-0 flex-1 gap-0.5'>
        <span className='text-[15px]'>{a.title}</span>
        <span className={`text-[12.5px] ${accent ? 'font-medium text-ok' : 'text-muted'}`}>
          {a.opensAt && !cancelled && a.admitted !== false ? `${formatSessionDate(new Date(a.opensAt), locale)} · ` : ''}
          {cancelled && a.feeStatus?.startsWith('REFUND') ? `${t('mylots.cancelled')} · ` : ''}
          {note}
        </span>
      </span>
      <ChevronRight className='size-4 shrink-0 text-muted' aria-hidden='true' />
    </Link>
  )
}
