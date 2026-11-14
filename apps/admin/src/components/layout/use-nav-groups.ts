import { useMemo } from 'react'
import { SECTION_LIST } from '@/config/sections'
import { useAuthStore } from '@/stores/auth-store'
import { canAccess } from '@/lib/rbac'
import { type NavGroup } from './types'

/** Меню, отфильтрованное по ролям текущего сотрудника. */
export function useNavGroups(): NavGroup[] {
  const user = useAuthStore((s) => s.user)
  return useMemo(() => {
    const groups = new Map<string, NavGroup>()
    for (const s of SECTION_LIST) {
      if (!canAccess(user, s.id)) continue
      const group = groups.get(s.group) ?? { title: s.group, items: [] }
      group.items.push({ title: s.title, url: s.url, icon: s.icon })
      groups.set(s.group, group)
    }
    return [...groups.values()]
  }, [user])
}
