import { Link, createFileRoute } from '@tanstack/react-router'
import { ChevronRight, Gavel, Store } from 'lucide-react'
import { useI18n } from '@/app/i18n'
import { getWebApp } from '@/app/telegram'
import { isRegistered, maskPhone, publicNameOf, resetAccount, useAccount } from '@/entities/account/demo-account'
import { DEMO } from '@/entities/lot/api'
import { admittedLotIds, demoLot, useDemoVersion } from '@/entities/lot/demo-store'
import { cn } from '@/shared/lib/cn'

function MePage() {
  const { t, locale, setLocale } = useI18n()
  useDemoVersion()
  const account = useAccount()
  const registered = isRegistered(account)
  const name = registered ? publicNameOf(account) : getWebApp()?.initDataUnsafe.user?.first_name
  const lots = admittedLotIds().map(demoLot).filter(Boolean)

  return (
    <div className='flex flex-col gap-5 px-4 pt-4'>
      <h1 className='text-xl font-semibold'>{name ?? t('me.title')}</h1>

      {!registered ? (
        <section className='grid gap-2' aria-label={t('welcome.title')}>
          <h2 className='text-[15px] font-semibold'>{t('welcome.title')}</h2>
          {(
            [
              ['/register', Gavel, 'welcome.buyer', 'welcome.buyer.text'],
              ['/seller', Store, 'welcome.seller', 'welcome.seller.text'],
            ] as const
          ).map(([to, Icon, title, text]) => (
            <Link
              key={to}
              to={to}
              className='flex min-h-16 items-center gap-3 rounded-2xl border border-line px-4 py-3'
            >
              <Icon className='size-6 shrink-0 text-brand-ink' aria-hidden='true' />
              <span className='grid flex-1 gap-0.5'>
                <span className='text-[15px] font-semibold'>{t(title)}</span>
                <span className='text-[12.5px] text-muted'>{t(text)}</span>
              </span>
              <ChevronRight className='size-4 text-muted' aria-hidden='true' />
            </Link>
          ))}
        </section>
      ) : (
        <section className='divide-y divide-line rounded-2xl border border-line px-4'>
          <div className='flex justify-between py-3 text-[14px]'>
            <span className='text-muted'>{t('me.phone')}</span>
            <span>{account.phone ? maskPhone(account.phone) : '—'}</span>
          </div>
          <Link to='/seller' className='flex min-h-12 items-center justify-between py-3 text-[14px]'>
            <span className='text-muted'>{t('me.seller')}</span>
            <span className='flex items-center gap-1'>
              {account.seller.status === 'review' ? t('seller.review') : t('me.becomeSeller')}
              <ChevronRight className='size-4 text-muted' aria-hidden='true' />
            </span>
          </Link>
        </section>
      )}

      <section className='grid gap-2'>
        <h2 className='text-[13px] text-muted'>{t('me.language')}</h2>
        <div className='grid grid-cols-2 gap-1 rounded-xl bg-surface p-1'>
          {(['ru', 'uz'] as const).map((l) => (
            <button
              key={l}
              type='button'
              onClick={() => setLocale(l)}
              className={cn(
                'h-9 rounded-lg text-[14px]',
                locale === l ? 'bg-bg font-semibold shadow-sm' : 'text-muted'
              )}
            >
              {l === 'ru' ? 'Русский' : 'Oʻzbekcha'}
            </button>
          ))}
        </div>
      </section>

      <section className='grid gap-2'>
        <h2 className='text-[13px] text-muted'>{t('me.admissions')}</h2>
        {lots.length === 0 ? (
          <p className='text-[14px]'>{t('me.none')}</p>
        ) : (
          <ul className='divide-y divide-line'>
            {lots.map((l) => (
              <li key={l!.id}>
                <Link to='/lot/$lotId' params={{ lotId: l!.id }} className='block py-3 text-[15px]'>
                  {l!.title}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {DEMO && (account.phone || account.seller.status !== 'none') && (
        <button
          type='button'
          onClick={resetAccount}
          className='min-h-11 text-[13px] text-muted underline underline-offset-4'
        >
          {t('me.resetDemo')}
        </button>
      )}
    </div>
  )
}

export const Route = createFileRoute('/me')({ component: MePage })
