import { createFileRoute } from '@tanstack/react-router'
import { requireSection } from '@/lib/require-section'
import { StaffPage } from '@/features/manage/staff-page'

export const Route = createFileRoute('/_authenticated/staff/')({
  beforeLoad: requireSection('staff'),
  component: StaffPage,
})
