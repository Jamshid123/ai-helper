import { useLocation } from '@tanstack/react-router'
import { areaOf, visibleTabs } from '@/config/nav'
import { useAuthStore } from '@/stores/auth-store'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { SectionTabs } from '@/components/layout/section-tabs'
import { Search } from '@/components/search'
import { ThemeSwitch } from '@/components/theme-switch'

type PageShellProps = {
  title: string
  description?: string
  actions?: React.ReactNode
  children: React.ReactNode
}

/**
 * Общая оболочка страницы: шапка с поиском и темой, заголовок раздела, вкладки, контент.
 * Страница внутри раздела (config/nav.ts) получает заголовок раздела и строку вкладок; её собственное
 * название — это вкладка.
 */
export function PageShell({
  title,
  description,
  actions,
  children,
}: PageShellProps) {
  const path = useLocation({
    select: (l) => l.pathname.replace(/(.)\/+$/, '$1'),
  })
  const user = useAuthStore((s) => s.user)
  const area = areaOf(path)
  const tabs = area && area.id !== 'overview' ? visibleTabs(user, area) : []
  return (
    <>
      <Header fixed>
        <Search className='me-auto' />
        <ThemeSwitch />
      </Header>
      <Main>
        <h1 className='mb-3 text-2xl font-semibold tracking-tight'>
          {area?.title ?? title}
        </h1>
        {tabs.length > 0 && <SectionTabs tabs={tabs} path={path} />}
        {(description || actions) && (
          <div className='mb-6 flex flex-wrap items-end justify-between gap-3'>
            {description && (
              <p className='max-w-2xl text-muted-foreground'>{description}</p>
            )}
            {actions && <div className='ms-auto'>{actions}</div>}
          </div>
        )}
        {children}
      </Main>
    </>
  )
}
