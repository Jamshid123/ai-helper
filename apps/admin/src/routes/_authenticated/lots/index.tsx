import { createFileRoute } from '@tanstack/react-router'
import { requireSection } from '@/lib/require-section'
import { LotsPage } from '@/features/manage/lots-page'

export const Route = createFileRoute('/_authenticated/lots/')({
  beforeLoad: requireSection('lots'),
  component: LotsPage,
})
