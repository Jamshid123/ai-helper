import { createFileRoute } from '@tanstack/react-router'
import { requireSection } from '@/lib/require-section'
import { ProductsPage } from '@/features/manage/products-page'

export const Route = createFileRoute('/_authenticated/products/')({
  beforeLoad: requireSection('products'),
  component: ProductsPage,
})
