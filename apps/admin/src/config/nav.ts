import {
  Gavel,
  LayoutDashboard,
  Package,
  Settings,
  ShieldCheck,
  Users,
  Wallet,
} from 'lucide-react'
import { type Access, type Section, canAccess } from '@/lib/rbac'

/** Вкладка раздела = существующая страница со своим адресом и правом. */
export type NavTab = {
  section: Section
  title: string
  url: string
  /** Старые и другие названия — для поиска по разделам. */
  keywords?: string[]
}

export type NavArea = {
  id: string
  title: string
  icon: React.ElementType
  /** Группа в боковом меню; без группы — над всеми (Обзор). */
  group?: 'Управление' | 'Система'
  tabs: NavTab[]
}

/**
 * Боковое меню — 7 разделов, внутри вкладки (ТЗ «Реорганизация админки» 20.11.2026).
 * Адреса страниц прежние: старые ссылки, обновление страницы и «назад» работают без перенаправлений.
 * Права — по-прежнему на каждую страницу (`requireSection`) и на сервере (`@StaffOnly`); раздел виден,
 * если доступна хотя бы одна его вкладка.
 *
 * Скрыты до готовности API (решение владельца 20.11.2026): «Заявки продавцов» (Пользователи),
 * «Экспертиза» (Каталог), «Риски и споры» (Контроль), «Платежи» (Финансы). Подписки и финансовая
 * сводка — вне этой задачи, до решения владельца через idea-review и заключения муфтия.
 */
export const NAV_AREAS: NavArea[] = [
  {
    id: 'overview',
    title: 'Обзор',
    icon: LayoutDashboard,
    tabs: [{ section: 'dashboard', title: 'Обзор', url: '/' }],
  },
  {
    id: 'auctions',
    title: 'Аукционы',
    icon: Gavel,
    group: 'Управление',
    tabs: [
      {
        section: 'lots',
        title: 'Все лоты',
        url: '/lots',
        keywords: ['Лоты', 'Торги'],
      },
      { section: 'schedule', title: 'Расписание', url: '/schedule' },
      {
        section: 'lots',
        title: 'Результаты',
        url: '/results',
        keywords: ['Итоги', 'Завершённые'],
      },
      {
        section: 'fulfillment',
        title: 'Выдача',
        url: '/fulfillment',
        keywords: ['Код выдачи', 'Остаток'],
      },
    ],
  },
  {
    id: 'catalog',
    title: 'Каталог',
    icon: Package,
    group: 'Управление',
    tabs: [
      { section: 'products', title: 'Товары', url: '/products' },
      {
        section: 'categories',
        title: 'Категории',
        url: '/categories',
        keywords: ['Поля', 'Шаблоны'],
      },
    ],
  },
  {
    id: 'users',
    title: 'Пользователи',
    icon: Users,
    group: 'Управление',
    tabs: [
      {
        section: 'participants',
        title: 'Участники',
        url: '/participants',
        keywords: ['Ограничения', 'Покупатели'],
      },
    ],
  },
  {
    id: 'finance',
    title: 'Финансы',
    icon: Wallet,
    group: 'Управление',
    tabs: [
      {
        section: 'finance',
        title: 'Решения по 10%',
        url: '/finance',
        keywords: ['Платежи', 'Возврат', 'Удержание'],
      },
    ],
  },
  {
    id: 'control',
    title: 'Контроль',
    icon: ShieldCheck,
    group: 'Управление',
    tabs: [
      {
        section: 'audit',
        title: 'Журнал аудита',
        url: '/audit',
        keywords: ['Журнал', 'Аудит'],
      },
    ],
  },
  {
    id: 'settings',
    title: 'Настройки',
    icon: Settings,
    group: 'Система',
    tabs: [
      { section: 'staff', title: 'Сотрудники', url: '/staff' },
      {
        section: 'roles',
        title: 'Роли и доступ',
        url: '/roles',
        keywords: ['Роли', 'Права'],
      },
    ],
  },
]

/** Вкладки раздела, доступные сотруднику. */
export const visibleTabs = (user: Access | null | undefined, area: NavArea) =>
  area.tabs.filter((t) => canAccess(user, t.section))

/** Разделы, у которых есть хотя бы одна доступная вкладка; ссылка раздела — на первую из них. */
export function visibleAreas(user: Access | null | undefined) {
  return NAV_AREAS.flatMap((area) => {
    const tabs = visibleTabs(user, area)
    return tabs.length ? [{ ...area, tabs, url: tabs[0].url }] : []
  })
}

/** Раздел, которому принадлежит страница (по адресу без параметров). */
export function areaOf(pathname: string): NavArea | undefined {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname
  return NAV_AREAS.find((a) => a.tabs.some((t) => t.url === path))
}
