import { createFileRoute } from '@tanstack/react-router'
import { requireSection } from '@/lib/require-section'
import { FulfillmentPage } from '@/features/manage/fulfillment-page'

export const Route = createFileRoute('/_authenticated/fulfillment/')({
  beforeLoad: requireSection('fulfillment'),
  component: FulfillmentPage,
})
