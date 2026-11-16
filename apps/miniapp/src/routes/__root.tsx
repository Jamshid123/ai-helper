import { Link, Outlet, createRootRoute, useRouterState } from '@tanstack/react-router'
import { Gavel, User } from 'lucide-react'
import { useI18n } from '@/app/i18n'
import { isSignedIn, useMe } from '@/entities/account/session'
import { DEMO, TEST_STAND } from '@/entities/lot/api'
import { Onboarding } from '@/features/onboarding'
import { useOnboardingOpen } from '@/features/onboarding-store'
import { cn } from '@/shared/lib/cn'
import { Logo } from '@/shared/ui/logo'
import { WinBanner } from '@/features/win-banner'
import { NoticeBanner } from '@/features/relist'

function Root() {
  const { t } = useI18n()
  const path = useRouterState({ select: (s) => s.location.pathname })
  const inRoom = path.endsWith('/room')
  const onboarding = useOnboardingOpen()
  const { me } = useMe()

  if (onboarding) return <Onboarding />

  return (
    <div className='mx-auto flex min-h-svh w-full max-w-lg flex-col md:max-w-6xl'>
      {(DEMO || TEST_STAND) && (
        <div className='bg-surface px-4 py-1.5 text-center text-[11.5px] text-muted md:rounded-b-xl'>
          {t(DEMO ? 'app.demo' : 'app.testStand')}
        </div>
      )}
      {!inRoom && <WinBanner />}
      {!inRoom && <NoticeBanner />}
      {/* Десктоп: шапка с навигацией; на телефоне — нижняя панель */}
      <header className='sticky top-0 z-20 hidden items-center gap-6 border-b border-line bg-bg/95 px-6 py-3 backdrop-blur md:flex'>
        <Link to='/' aria-label='AuksionGO'>
          <Logo />
        </Link>
        <nav className='flex gap-1 text-[14px]'>
          <Link
            to='/'
            className={cn(
              'rounded-lg px-3 py-2',
              path === '/' || path.startsWith('/lot') ? 'bg-surface font-semibold' : 'text-muted hover:text-fg'
            )}
          >
            {t('nav.catalog')}
          </Link>
          <Link
            to='/me'
            className={cn(
              'rounded-lg px-3 py-2',
              path === '/me' ? 'bg-surface font-semibold' : 'text-muted hover:text-fg'
            )}
          >
            {t('nav.me')}
          </Link>
        </nav>
        <div className='ml-auto'>
          {isSignedIn(me) ? (
            <Link to='/me' className='flex items-center gap-2 text-[14px] font-medium'>
              <User className='size-4' aria-hidden='true' />
              {me.firstName}
            </Link>
          ) : (
            <Link
              to='/register'
              className='inline-flex h-10 items-center rounded-xl bg-primary px-4 text-[14px] font-semibold text-on-primary'
            >
              {t('login.title')}
            </Link>
          )}
        </div>
      </header>
      <main className='flex-1 pb-24 md:pb-10'>
        <Outlet />
      </main>
      {!inRoom && (
        <nav className='fixed inset-x-0 bottom-0 border-t border-line bg-bg pb-[env(safe-area-inset-bottom,0px)] md:hidden'>
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
