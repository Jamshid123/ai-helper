import { createFileRoute } from '@tanstack/react-router'
import { requireSection } from '@/lib/require-section'
import { RolesPage } from '@/features/manage/roles-page'

export const Route = createFileRoute('/_authenticated/roles/')({
  beforeLoad: requireSection('roles'),
  component: RolesPage,
})
