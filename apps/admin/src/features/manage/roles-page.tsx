import { useState } from 'react'
import { SECTIONS_BY_ID } from '@/config/sections'
import { Plus } from 'lucide-react'
import { MODULES, type AdminModule } from '@/lib/rbac'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { PageShell } from '@/components/layout/page-shell'
import {
  type Level,
  type RoleRow,
  useDeleteRole,
  useRoles,
  useSaveRole,
} from './api'
import { EmptyRow, Field } from './ui'

const LEVELS: { value: Level; label: string }[] = [
  { value: 'none', label: 'Нет' },
  { value: 'view', label: 'Просмотр' },
  { value: 'edit', label: 'Изменение' },
]
const title = (m: AdminModule) => SECTIONS_BY_ID[m].title

type Draft = {
  id?: string
  name: string
  permissions: Record<AdminModule, Level>
}
const fromRole = (r?: RoleRow): Draft => ({
  id: r?.id,
  name: r?.name ?? '',
  permissions: Object.fromEntries(
    MODULES.map((m) => [m, r?.permissions[m] ?? 'none'])
  ) as Record<AdminModule, Level>,
})

/** Сводка прав для таблицы: «Лоты, Товары · просмотр: Участники». */
function summary(r: RoleRow): string {
  const edit = MODULES.filter((m) => r.permissions[m] === 'edit').map(title)
  const view = MODULES.filter((m) => r.permissions[m] === 'view').map(title)
  return (
    [edit.join(', '), view.length ? `просмотр: ${view.join(', ')}` : '']
      .filter(Boolean)
      .join(' · ') || 'Нет доступа'
  )
}

export function RolesPage() {
  const meta = SECTIONS_BY_ID.roles
  const { data, isLoading } = useRoles()
  const save = useSaveRole()
  const remove = useDeleteRole()
  const [draft, setDraft] = useState<Draft | null>(null)
  const roles = data?.roles ?? []

  return (
    <PageShell
      title={meta.title}
      description={meta.description}
      actions={
        <Button onClick={() => setDraft(fromRole())}>
          <Plus /> Новая роль
        </Button>
      }
    >
      <div className='rounded-md border'>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Роль</TableHead>
              <TableHead>Права</TableHead>
              <TableHead className='text-right'>Сотрудников</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {!isLoading && roles.length === 0 && (
              <EmptyRow cols={4} text='Ролей пока нет' />
            )}
            {roles.map((r) => (
              <TableRow key={r.id}>
                <TableCell className='font-medium'>{r.name}</TableCell>
                <TableCell className='max-w-xl text-sm whitespace-normal text-muted-foreground'>
                  {summary(r)}
                </TableCell>
                <TableCell className='text-right tabular-nums'>
                  {r.staff}
                </TableCell>
                <TableCell className='space-x-1 text-right whitespace-nowrap'>
                  <Button
                    variant='ghost'
                    size='sm'
                    onClick={() => setDraft(fromRole(r))}
                  >
                    Настроить
                  </Button>
                  {r.staff === 0 && (
                    <Button
                      variant='ghost'
                      size='sm'
                      className='text-destructive'
                      disabled={remove.isPending}
                      onClick={() => remove.mutate(r.id)}
                    >
                      Удалить
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <p className='mt-3 text-xs text-muted-foreground'>
        Сотрудников и роли настраивает только владелец. Изменённые права
        действуют сразу, без повторного входа.
      </p>

      <Dialog open={draft !== null} onOpenChange={(v) => !v && setDraft(null)}>
        <DialogContent className='max-h-[90svh] overflow-y-auto sm:max-w-xl'>
          <DialogHeader>
            <DialogTitle>{draft?.id ? 'Права роли' : 'Новая роль'}</DialogTitle>
            <DialogDescription>
              По каждому разделу: нет доступа, только просмотр или изменение.
            </DialogDescription>
          </DialogHeader>
          {draft && (
            <div className='grid gap-4'>
              <Field label='Название'>
                <Input
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                />
              </Field>
              <div
                className='grid gap-1'
                role='table'
                aria-label='Права по разделам'
              >
                {MODULES.map((m) => (
                  <div
                    key={m}
                    role='row'
                    className='flex items-center justify-between gap-3 border-b py-1.5 last:border-b-0'
                  >
                    <span role='rowheader' className='text-sm'>
                      {title(m)}
                    </span>
                    <div
                      role='radiogroup'
                      aria-label={title(m)}
                      className='flex shrink-0 rounded-md bg-muted p-0.5'
                    >
                      {LEVELS.map((l) => {
                        const active = draft.permissions[m] === l.value
                        return (
                          <button
                            key={l.value}
                            type='button'
                            role='radio'
                            aria-checked={active}
                            onClick={() =>
                              setDraft({
                                ...draft,
                                permissions: {
                                  ...draft.permissions,
                                  [m]: l.value,
                                },
                              })
                            }
                            className={cn(
                              'rounded px-2.5 py-1 text-xs font-medium transition-colors',
                              active
                                ? 'bg-background text-foreground shadow-sm'
                                : 'text-muted-foreground'
                            )}
                          >
                            {l.label}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
              <div className='flex gap-2'>
                {LEVELS.map((l) => (
                  <Button
                    key={l.value}
                    type='button'
                    variant='outline'
                    size='sm'
                    onClick={() =>
                      setDraft({
                        ...draft,
                        permissions: Object.fromEntries(
                          MODULES.map((m) => [m, l.value])
                        ) as Record<AdminModule, Level>,
                      })
                    }
                  >
                    Всё: {l.label.toLowerCase()}
                  </Button>
                ))}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant='outline' onClick={() => setDraft(null)}>
              Отмена
            </Button>
            <Button
              disabled={
                !draft || draft.name.trim().length < 2 || save.isPending
              }
              onClick={() =>
                draft &&
                save.mutate(
                  {
                    id: draft.id,
                    name: draft.name.trim(),
                    permissions: draft.permissions,
                  },
                  { onSuccess: () => setDraft(null) }
                )
              }
            >
              Сохранить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  )
}
