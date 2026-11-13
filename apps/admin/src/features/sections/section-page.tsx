import { Construction } from 'lucide-react'
import { SECTIONS_BY_ID } from '@/config/sections'
import { type Section } from '@/lib/rbac'
import { PageShell } from '@/components/layout/page-shell'

/** Заглушка раздела до подключения API: что здесь будет по ТЗ. */
export function SectionPage({ id }: { id: Section }) {
  const meta = SECTIONS_BY_ID[id]
  return (
    <PageShell title={meta.title} description={meta.description}>
      <div className='max-w-2xl rounded-lg border border-dashed p-6'>
        <div className='mb-3 flex items-center gap-2 text-sm font-medium'>
          <Construction className='size-4 text-muted-foreground' />
          Раздел появится вместе с API
        </div>
        <ul className='list-disc space-y-1.5 ps-5 text-sm text-muted-foreground'>
          {meta.planned.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </div>
    </PageShell>
  )
}
