import { useCallback, useSyncExternalStore } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Bell, BellRing } from 'lucide-react'
import { useI18n, type TKey } from '@/app/i18n'
import { haptic } from '@/app/telegram'
import { DEMO, TEST_STAND } from '@/entities/lot/api'
import { api } from '@/shared/api/client'
import { cn } from '@/shared/lib/cn'

/**
 * «Напомнить о начале» (за 15 мин / 1 ч / накануне). Демо: хранится на устройстве.
 * В Telegram: PUT/GET/DELETE /api/v1/lots/:id/reminder; сообщение отправит бот (модуль уведомлений — следующий шаг).
 */
const OPTIONS = [15, 60, 1440] as const
type Minutes = (typeof OPTIONS)[number]
const KEY = 'auksion.demo.reminders'
const listeners = new Set<() => void>()

function readAll(): Record<string, Minutes> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, Minutes>
  } catch {
    return {}
  }
}
let cache = readAll()

function save(lotId: string, m: Minutes | null) {
  const next = { ...cache }
  if (m === null) delete next[lotId]
  else next[lotId] = m
  cache = next
  try {
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    // не критично
  }
  listeners.forEach((l) => l())
}

function useLocalReminder(lotId: string): Minutes | null {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => cache[lotId] ?? null
  )
}

function useReminder(lotId: string): { current: Minutes | null; set: (m: Minutes | null) => Promise<void> } {
  const local = useLocalReminder(lotId)
  const qc = useQueryClient()
  const q = useQuery({
    queryKey: ['reminder', lotId],
    queryFn: () => api<{ minutesBefore: Minutes } | null>(`/lots/${lotId}/reminder`),
    enabled: !DEMO,
  })
  const set = useCallback(
    async (m: Minutes | null) => {
      if (DEMO) return save(lotId, m)
      if (m === null) await api(`/lots/${lotId}/reminder`, { method: 'DELETE' })
      else await api(`/lots/${lotId}/reminder`, { method: 'PUT', body: { minutesBefore: m } })
      await qc.invalidateQueries({ queryKey: ['reminder', lotId] })
    },
    [lotId, qc]
  )
  return { current: DEMO ? local : (q.data?.minutesBefore ?? null), set }
}

export function RemindCard({ lotId, opensAt, now }: { lotId: string; opensAt: number; now: number }) {
  const { t } = useI18n()
  const { current, set } = useReminder(lotId)
  const label = (m: Minutes) => t(`remind.${m}` as TKey)
  const available = OPTIONS.filter((m) => opensAt - m * 60_000 > now)
  if (!available.length && current === null) return null

  if (current !== null) {
    return (
      <section className='flex items-center justify-between gap-3 rounded-2xl border border-line px-4 py-3'>
        <span className='flex items-center gap-2 text-[14px]'>
          <BellRing className='size-4 text-brand-ink' aria-hidden='true' />
          {t('remind.on')}: {label(current).toLowerCase()}
        </span>
        <button
          type='button'
          onClick={() => void set(null).catch(() => haptic('error'))}
          className='min-h-11 px-2 text-[13px] text-muted underline underline-offset-4'
        >
          {t('remind.off')}
        </button>
      </section>
    )
  }

  return (
    <section className='grid gap-2 rounded-2xl border border-line px-4 py-3'>
      <h2 className='flex items-center gap-2 text-[15px] font-semibold'>
        <Bell className='size-4 text-brand-ink' aria-hidden='true' /> {t('remind.title')}
      </h2>
      <div className={cn('grid gap-2', available.length === 3 ? 'grid-cols-3' : 'grid-cols-2')}>
        {available.map((m) => (
          <button
            key={m}
            type='button'
            onClick={() =>
              void set(m).then(
                () => haptic('success'),
                () => haptic('error')
              )
            }
            className='h-11 rounded-xl bg-surface text-[13px] font-medium'
          >
            {label(m)}
          </button>
        ))}
      </div>
      {(DEMO || TEST_STAND) && <p className='text-[12px] text-muted'>{t('remind.demo')}</p>}
    </section>
  )
}
