import { SECTIONS_BY_ID } from '@/config/sections'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { PageShell } from '@/components/layout/page-shell'
import { useAudit } from './api'
import { dateTime } from './format'
import { EmptyRow } from './ui'

const ACTIONS: Record<string, string> = {
  'staff.login': 'Вход в админку',
  'staff.logout': 'Выход из админки',
  'staff.locked': 'Блокировка после неудачных попыток',
  'staff.created': 'Создан сотрудник',
  'category.created': 'Создана категория',
  'category.updated': 'Изменена категория',
  'product.created': 'Добавлен товар',
  'product.updated': 'Изменён товар',
  'lot.created': 'Создан лот',
  'lot.updated': 'Изменён лот',
  'lot.published': 'Опубликован лот',
  'lot.cancelled': 'Отменён лот',
  'restriction.created': 'Ограничено участие',
  'restriction.lifted': 'Снято ограничение',
  'admission.cancelled': 'Отменён допуск (сотрудник)',
  'admission.left': 'Участник вышел из лота',
}

export function AuditPage() {
  const meta = SECTIONS_BY_ID.audit
  const { data = [], isLoading } = useAudit()
  return (
    <PageShell title={meta.title} description={meta.description}>
      <div className='rounded-md border'>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Когда</TableHead>
              <TableHead>Кто</TableHead>
              <TableHead>Что</TableHead>
              <TableHead>Причина</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {!isLoading && data.length === 0 && (
              <EmptyRow cols={4} text='Записей пока нет' />
            )}
            {data.map((e) => (
              <TableRow key={e.id}>
                <TableCell className='text-sm whitespace-nowrap'>
                  {dateTime(e.createdAt)}
                </TableCell>
                <TableCell>{e.actor}</TableCell>
                <TableCell>
                  {ACTIONS[e.action] ?? e.action}
                  {e.entityId && (
                    <span className='block font-mono text-xs text-muted-foreground'>
                      {e.entityType} · {e.entityId.slice(0, 8)}
                    </span>
                  )}
                </TableCell>
                <TableCell className='max-w-xs text-sm'>
                  {e.reason ?? '—'}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </PageShell>
  )
}
