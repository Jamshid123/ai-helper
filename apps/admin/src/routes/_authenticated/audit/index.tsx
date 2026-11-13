import { createFileRoute } from '@tanstack/react-router'
import { requireSection } from '@/lib/require-section'
import { SectionPage } from '@/features/sections/section-page'

export const Route = createFileRoute('/_authenticated/audit/')({
  beforeLoad: requireSection('audit'),
  component: () => <SectionPage id='audit' />,
})
