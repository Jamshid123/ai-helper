import { Link, createFileRoute } from '@tanstack/react-router'
import { useI18n } from '@/app/i18n'
import { getWebApp } from '@/app/telegram'
import { admittedLotIds, demoLot, useDemoVersion } from '@/entities/lot/demo-store'
import { cn } from '@/shared/lib/cn'

function MePage() {
  const { t, locale, setLocale } = useI18n()
  useDemoVersion()
  const name = getWebApp()?.initDataUnsafe.user?.first_name
  const lots = admittedLotIds().map(demoLot).filter(Boolean)

  return (
    <div className='flex flex-col gap-5 px-4 pt-4'>
      <h1 className='text-xl font-semibold'>{name ?? t('me.title')}</h1>

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
    </div>
  )
}

export const Route = createFileRoute('/me')({ component: MePage })
