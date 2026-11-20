import { createFileRoute } from '@tanstack/react-router'
import { Dashboard } from '@/features/dashboard'
import { type Period, parsePeriod } from '@/features/dashboard/api'

export const Route = createFileRoute('/_authenticated/')({
  validateSearch: (s: Record<string, unknown>): { period?: Period } => {
    const period = parsePeriod(s.period)
    return period ? { period } : {}
  },
  component: Dashboard,
})
