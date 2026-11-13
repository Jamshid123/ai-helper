import { createFileRoute } from '@tanstack/react-router'
import { requireSection } from '@/lib/require-section'
import { SectionPage } from '@/features/sections/section-page'

export const Route = createFileRoute('/_authenticated/finance/')({
  beforeLoad: requireSection('finance'),
  component: () => <SectionPage id='finance' />,
})
