import { createFileRoute } from '@tanstack/react-router'
import { requireSection } from '@/lib/require-section'
import { SectionPage } from '@/features/sections/section-page'

export const Route = createFileRoute('/_authenticated/schedule/')({
  beforeLoad: requireSection('schedule'),
  component: () => <SectionPage id='schedule' />,
})
