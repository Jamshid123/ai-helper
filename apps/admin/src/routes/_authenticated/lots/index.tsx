import { createFileRoute } from '@tanstack/react-router'
import { requireSection } from '@/lib/require-section'
import { type LotFilter, parseLotFilter } from '@/features/manage/lot-filters'
import { LotsPage } from '@/features/manage/lots-page'

export const Route = createFileRoute('/_authenticated/lots/')({
  validateSearch: (s: Record<string, unknown>): { status?: LotFilter } => {
    const status = parseLotFilter(s.status)
    return status ? { status } : {}
  },
  beforeLoad: requireSection('lots'),
  component: () => <LotsPage view='all' />,
})
