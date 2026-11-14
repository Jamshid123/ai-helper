import { createFileRoute } from '@tanstack/react-router'
import { requireSection } from '@/lib/require-section'
import { CategoriesPage } from '@/features/manage/categories-page'

export const Route = createFileRoute('/_authenticated/categories/')({
  beforeLoad: requireSection('categories'),
  component: CategoriesPage,
})
