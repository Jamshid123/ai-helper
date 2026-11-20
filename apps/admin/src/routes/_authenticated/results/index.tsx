import { createFileRoute } from '@tanstack/react-router'
import { requireSection } from '@/lib/require-section'
import { LotsPage } from '@/features/manage/lots-page'

/** Аукционы / Результаты (ТЗ 20.11.2026, P0): завершённые лоты — итоговая цена и участники, только просмотр. */
export const Route = createFileRoute('/_authenticated/results/')({
  beforeLoad: requireSection('lots'),
  component: () => <LotsPage view='results' />,
})
