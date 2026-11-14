import { createFileRoute } from '@tanstack/react-router'
import { requireSection } from '@/lib/require-section'
import { SchedulePage } from '@/features/manage/schedule-page'

export const Route = createFileRoute('/_authenticated/schedule/')({
  beforeLoad: requireSection('schedule'),
  component: SchedulePage,
})
