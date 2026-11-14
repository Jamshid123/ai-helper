import { createFileRoute } from '@tanstack/react-router'
import { requireSection } from '@/lib/require-section'
import { AuditPage } from '@/features/manage/audit-page'

export const Route = createFileRoute('/_authenticated/audit/')({
  beforeLoad: requireSection('audit'),
  component: AuditPage,
})
