import { Link, Outlet, createRootRoute, useRouterState } from '@tanstack/react-router'
import { Gavel, User } from 'lucide-react'
import { useI18n } from '@/app/i18n'
import { isInTelegram } from '@/app/telegram'
import { DEMO } from '@/entities/lot/api'
import { cn } from '@/shared/lib/cn'

function Root() {
  const { t } = useI18n()
  const path = useRouterState({ select: (s) => s.location.pathname })
  const inRoom = path.endsWith('/room')

  if (!DEMO && !isInTelegram()) {
    return (
      <main className='grid min-h-svh place-items-center p-6 text-center'>
        <p className='text-lg font-semibold'>{t('app.openInTelegram')}</p>
      </main>
    )
  }

  return (
    <div className='mx-auto flex min-h-svh max-w-lg flex-col'>
      {DEMO && <div className='bg-surface px-4 py-1.5 text-center text-[11.5px] text-muted'>{t('app.demo')}</div>}
      <main className='flex-1 pb-24'>
        <Outlet />
      </main>
      {!inRoom && (
        <nav className='fixed inset-x-0 bottom-0 border-t border-line bg-bg pb-[env(safe-area-inset-bottom,0px)]'>
          <div className='mx-auto grid max-w-lg grid-cols-2'>
            {[
              {
                to: '/',
                label: t('nav.catalog'),
                Icon: Gavel,
                active: path === '/' || path.startsWith('/lot'),
              },
              {
                to: '/me',
                label: t('nav.me'),
                Icon: User,
                active: path === '/me',
              },
            ].map(({ to, label, Icon, active }) => (
              <Link
                key={to}
                to={to}
                className={cn('flex flex-col items-center gap-0.5 py-2 text-[11px]', active ? 'text-fg' : 'text-muted')}
              >
                <Icon className='size-5' strokeWidth={active ? 2.4 : 1.8} />
                {label}
              </Link>
            ))}
          </div>
        </nav>
      )}
    </div>
  )
}

export const Route = createRootRoute({ component: Root })
