import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { Search } from '@/components/search'
import { ThemeSwitch } from '@/components/theme-switch'

type PageShellProps = {
  title: string
  description?: string
  actions?: React.ReactNode
  children: React.ReactNode
}

/** Общая оболочка страницы раздела: шапка с поиском и темой, заголовок, контент. */
export function PageShell({ title, description, actions, children }: PageShellProps) {
  return (
    <>
      <Header fixed>
        <Search className='me-auto' />
        <ThemeSwitch />
      </Header>
      <Main>
        <div className='mb-6 flex flex-wrap items-end justify-between gap-3'>
          <div className='space-y-1'>
            <h1 className='text-2xl font-semibold tracking-tight'>{title}</h1>
            {description && <p className='max-w-2xl text-muted-foreground'>{description}</p>}
          </div>
          {actions}
        </div>
        {children}
      </Main>
    </>
  )
}
