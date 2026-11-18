import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { RotateCcw, X } from 'lucide-react'
import { useI18n } from '@/app/i18n'
import { haptic } from '@/app/platform'
import { type AdmissionInfo, useConfirmParticipation } from '@/entities/lot/api'
import { type Lot } from '@/entities/lot/types'
import { useNotices, useReadNotice } from '@/entities/notifications/api'
import { errorText } from '@/shared/api/error-text'
import { formatSessionDate } from '@/shared/lib/format-date'
import { Button } from '@/shared/ui/button'

/**
 * Повторные торги (решение 16.11.2026): нейтрально, без причины и имён; «допуск сохранён, платить ещё раз не нужно».
 */

/** Старый лот: сделка не состоялась → ссылка на повторные торги (или «дату сообщим»). */
export function RelistNotice({ lot }: { lot: Lot }) {
  const { t } = useI18n()
  if (lot.status !== 'closed' || (!lot.relistLotId && !lot.relistPending)) return null
  return (
    <section className='grid gap-2 rounded-2xl border border-line px-4 py-3'>
      <span className='inline-flex items-center gap-1.5 text-[14px] font-semibold'>
        <RotateCcw className='size-4 text-brand-ink' aria-hidden='true' /> {t('relist.notice')}
      </span>
      {lot.relistLotId ? (
        <Link
          to='/lot/$lotId'
          params={{ lotId: lot.relistLotId }}
          className='text-[14px] font-medium text-brand-ink underline-offset-2 hover:underline'
        >
          {t('relist.open')}
        </Link>
      ) : (
        <span className='text-[13px] text-muted'>{t('relist.pending')}</span>
      )}
    </section>
  )
}

/** Лот повторных торгов, допуск перенесён: «платить ещё раз не нужно» и «Подтверждаю участие». */
export function CarriedCard({ info, opensAt }: { info: AdmissionInfo; opensAt: number }) {
  const { t, locale } = useI18n()
  const confirm = useConfirmParticipation()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // места неподтвердивших освобождаются за 2 ч до старта (RULES.RELIST_CONFIRM_BEFORE_H)
  const deadline = formatSessionDate(new Date(opensAt - 2 * 3_600_000), locale)
  return (
    <section className='grid gap-2 rounded-2xl border border-ok/30 px-4 py-3'>
      <span className='text-[14px] font-semibold text-ok'>✓ {t('relist.saved')}</span>
      {info.confirmed ? (
        <span className='text-[13px] text-muted'>{t('relist.confirmed')}</span>
      ) : (
        <>
          <span className='text-[13px] text-muted'>{t('relist.confirmBy').replace('{until}', deadline)}</span>
          <Button
            disabled={pending}
            onClick={() => {
              setPending(true)
              setError(null)
              confirm(info.lotId)
                .then(
                  () => haptic('success'),
                  (e: unknown) => {
                    haptic('error')
                    setError(errorText(t, e))
                  }
                )
                .finally(() => setPending(false))
            }}
            className='w-full'
          >
            {t('relist.confirm')}
          </Button>
          <span className='text-[12.5px] text-muted'>{t('relist.noAction')}</span>
        </>
      )}
      {error && (
        <p role='alert' className='text-[13px] font-medium text-hot-text'>
          {error}
        </p>
      )}
    </section>
  )
}

const NOTICE_TEXT = {
  relist_invite: 'relist.banner.invite',
  relist_reminder: 'relist.banner.reminder',
  relist_released: 'relist.banner.released',
  relist_cancelled: 'relist.banner.cancelled',
} as const

/** Личная плашка на любом экране: приглашение, напоминание, освобождённое место или отмена. */
export function NoticeBanner() {
  const { t, locale } = useI18n()
  const notices = useNotices()
  const read = useReadNotice()
  const n = notices.find((x) => x.type in NOTICE_TEXT)
  if (!n) return null
  const key = NOTICE_TEXT[n.type as keyof typeof NOTICE_TEXT]
  const text = t(key)
    .replace('{title}', n.lotTitle)
    .replace('{when}', n.opensAt ? formatSessionDate(new Date(n.opensAt), locale) : '')
  const linkable = n.type === 'relist_invite' || n.type === 'relist_reminder'
  return (
    <div className='flex items-start gap-3 border-b border-line bg-surface px-4 py-3 text-[14px] md:rounded-b-xl'>
      <RotateCcw className='mt-0.5 size-4 shrink-0 text-brand-ink' aria-hidden='true' />
      <div className='grid flex-1 gap-1'>
        <span>{text}</span>
        {linkable && (
          <Link
            to='/lot/$lotId'
            params={{ lotId: n.lotId }}
            onClick={() => void read(n.id)}
            className='font-semibold text-brand-ink'
          >
            {t('relist.open')}
          </Link>
        )}
      </div>
      <button
        type='button'
        onClick={() => void read(n.id)}
        aria-label={t('relist.dismiss')}
        className='-m-2 grid size-10 shrink-0 place-items-center text-muted'
      >
        <X className='size-4' aria-hidden='true' />
      </button>
    </div>
  )
}
