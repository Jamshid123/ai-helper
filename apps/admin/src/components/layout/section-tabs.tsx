import { Link } from '@tanstack/react-router'
import { type NavTab } from '@/config/nav'
import { cn } from '@/lib/utils'

/**
 * Вкладки раздела (ТЗ 20.11.2026): активная вкладка определяется адресом, а не состоянием страницы —
 * прямые ссылки, обновление и «назад/вперёд» работают. На узком экране — горизонтальная прокрутка.
 */
export function SectionTabs({ tabs, path }: { tabs: NavTab[]; path: string }) {
  return (
    <nav
      aria-label='Вкладки раздела'
      className='-mx-1 mb-4 overflow-x-auto border-b'
    >
      <ul className='flex min-w-max gap-1 px-1'>
        {tabs.map((t) => {
          const active = t.url === path
          return (
            <li key={t.url}>
              <Link
                to={t.url}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  '-mb-px inline-flex h-10 items-center border-b-2 px-3 text-sm whitespace-nowrap transition-colors focus-visible:outline-2',
                  active
                    ? 'border-primary font-medium text-foreground'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                )}
              >
                {t.title}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
