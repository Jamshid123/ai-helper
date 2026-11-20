import { useMemo } from 'react'
import { visibleAreas } from '@/config/nav'
import { useAuthStore } from '@/stores/auth-store'
import { type NavGroup } from './types'

/** Меню: 7 разделов (config/nav.ts), отфильтрованных по правам текущего сотрудника. */
export function useNavGroups(): NavGroup[] {
  const user = useAuthStore((s) => s.user)
  return useMemo(() => {
    const groups = new Map<string, NavGroup>()
    for (const a of visibleAreas(user)) {
      const title = a.group ?? ''
      const group = groups.get(title) ?? { title, items: [] }
      group.items.push({
        title: a.title,
        url: a.url,
        icon: a.icon,
        activeUrls: a.tabs.map((t) => t.url),
        tabs: a.tabs.map((t) => ({
          title: t.title,
          url: t.url,
          keywords: t.keywords,
        })),
      })
      groups.set(title, group)
    }
    return [...groups.values()]
  }, [user])
}
