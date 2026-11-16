import { Link } from '@tanstack/react-router'
import { useI18n } from '@/app/i18n'
import { usePurchases } from '@/entities/purchase/api'
import { formatCountdown, useNow } from '@/shared/lib/use-now'

/** На любом экране: «Вы победили — оплатите 10%» с обратным отсчётом (15 минут легко пропустить). */
export function WinBanner() {
  const { t } = useI18n()
  const now = useNow()
  const due = usePurchases().find(
    (p) => p.status === 'AWAITING_PREPAYMENT' && p.prepaymentDeadline && new Date(p.prepaymentDeadline).getTime() > now
  )
  if (!due) return null
  const left = new Date(due.prepaymentDeadline!).getTime() - now
  return (
    <Link
      to='/lot/$lotId/room'
      params={{ lotId: due.lotId }}
      className='sticky top-0 z-30 flex items-center justify-between gap-3 bg-primary px-4 py-2.5 text-[14px] font-semibold text-on-primary md:static md:rounded-b-xl'
    >
      <span>{t('buy.banner')}</span>
      <span className='tabular'>{formatCountdown(left, t('time.d'))}</span>
    </Link>
  )
}
