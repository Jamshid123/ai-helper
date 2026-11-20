import { createFileRoute } from '@tanstack/react-router'
import { requireSection } from '@/lib/require-section'
import { FulfillmentPage } from '@/features/manage/fulfillment-page'

/** Финансы / Решения по 10% (решение владельца 20.11.2026; раньше — фильтр в «Выдаче»). */
export const Route = createFileRoute('/_authenticated/finance/')({
  beforeLoad: requireSection('finance'),
  component: () => <FulfillmentPage mode='finance' />,
})
