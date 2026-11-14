import { createFileRoute } from '@tanstack/react-router'
import { requireSection } from '@/lib/require-section'
import { ParticipantsPage } from '@/features/manage/participants-page'

export const Route = createFileRoute('/_authenticated/participants/')({
  beforeLoad: requireSection('participants'),
  component: ParticipantsPage,
})
