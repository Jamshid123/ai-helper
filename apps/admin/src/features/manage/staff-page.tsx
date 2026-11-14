import { useId, useState } from 'react'
import { SECTIONS_BY_ID } from '@/config/sections'
import { Plus, RefreshCw } from 'lucide-react'
import { useAuthStore } from '@/stores/auth-store'
import { Badge } from '@/components/ui/badge'
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
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
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
  type Staff,
  useCreateStaff,
  useRoles,
  useSetStaffPassword,
  useStaff,
  useUpdateStaff,
} from './api'
import { EmptyRow, Field } from './ui'

const MIN_PASSWORD = 12

/** Пароль из трёх «слов» и числа: легко продиктовать сотруднику, ~20 символов. */
function generatePassword(): string {
  const syll = [
    'ka',
    'mo',
    'ri',
    'ta',
    'nu',
    'si',
    'lo',
    've',
    'da',
    'zu',
    'pe',
    'go',
    'ba',
    'xi',
    'ye',
    'fo',
  ]
  const rnd = (n: number) => crypto.getRandomValues(new Uint32Array(1))[0] % n
  const word = () =>
    Array.from({ length: 3 }, () => syll[rnd(syll.length)]).join('')
  return `${word()}-${word()}-${word()}-${String(rnd(90) + 10)}`
}

type Draft = {
  id?: string
  isOwner?: boolean
  firstName: string
  lastName: string
  phone: string
  roleId: string
  password: string
  disabled: boolean
}

function PasswordField({
  value,
  onChange,
}: {
  value: string
  onChange: (v: string) => void
}) {
  const id = useId()
  return (
    <div className='grid gap-1.5'>
      <Label htmlFor={id}>Пароль</Label>
      <div className='flex gap-2'>
        <Input
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete='off'
          className='font-mono'
        />
        <Button
          type='button'
          variant='outline'
          size='icon'
          aria-label='Сгенерировать пароль'
          onClick={() => onChange(generatePassword())}
        >
          <RefreshCw />
        </Button>
      </div>
      <p className='text-xs text-muted-foreground'>
        Не короче {MIN_PASSWORD} символов. Виден только сейчас — скопируйте и
        передайте сотруднику.
      </p>
    </div>
  )
}

export function StaffPage() {
  const meta = SECTIONS_BY_ID.staff
  const me = useAuthStore((s) => s.user)
  const { data = [], isLoading } = useStaff()
  const { data: roleData } = useRoles()
  const roles = roleData?.roles ?? []
  const create = useCreateStaff()
  const update = useUpdateStaff()
  const setPassword = useSetStaffPassword()
  const [draft, setDraft] = useState<Draft | null>(null)
  const [pwdFor, setPwdFor] = useState<Staff | null>(null)
  const [newPwd, setNewPwd] = useState('')

  const isSelf = (id?: string) => Boolean(id && me?.id === id)
  const valid =
    draft !== null &&
    draft.firstName.trim() !== '' &&
    draft.phone.replace(/\D/g, '').length >= 9 &&
    (draft.isOwner || draft.roleId !== '') &&
    (Boolean(draft.id) || draft.password.length >= MIN_PASSWORD)

  const save = () => {
    if (!draft) return
    const body = {
      firstName: draft.firstName.trim(),
      lastName: draft.lastName.trim(),
      phone: draft.phone,
      ...(!draft.isOwner && { roleId: draft.roleId }),
    }
    const done = { onSuccess: () => setDraft(null) }
    if (draft.id)
      update.mutate(
        {
          id: draft.id,
          ...body,
          ...(!draft.isOwner && { disabled: draft.disabled }),
        },
        done
      )
    else create.mutate({ ...body, password: draft.password }, done)
  }

  const blank = (): Draft => ({
    firstName: '',
    lastName: '',
    phone: '+998 ',
    roleId: roles.find((r) => r.name === 'Оператор')?.id ?? roles[0]?.id ?? '',
    password: generatePassword(),
    disabled: false,
  })

  return (
    <PageShell
      title={meta.title}
      description={meta.description}
      actions={
        <Button onClick={() => setDraft(blank())} disabled={!roles.length}>
          <Plus /> Добавить сотрудника
        </Button>
      }
    >
      <div className='rounded-md border'>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Сотрудник</TableHead>
              <TableHead>Телефон (логин)</TableHead>
              <TableHead>Роль</TableHead>
              <TableHead>Доступ</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {!isLoading && data.length === 0 && (
              <EmptyRow cols={5} text='Сотрудников пока нет' />
            )}
            {data.map((s) => (
              <TableRow
                key={s.id}
                className={s.disabled ? 'opacity-60' : undefined}
              >
                <TableCell className='font-medium'>
                  {s.name}
                  {isSelf(s.id) && (
                    <span className='ms-2 text-xs text-muted-foreground'>
                      это вы
                    </span>
                  )}
                </TableCell>
                <TableCell className='tabular-nums'>
                  {s.phone ?? (
                    <span className='text-muted-foreground'>
                      не задан ({s.email})
                    </span>
                  )}
                </TableCell>
                <TableCell>
                  {s.isOwner ? (
                    <Badge>Владелец</Badge>
                  ) : (
                    <Badge variant='secondary'>{s.role?.name ?? '—'}</Badge>
                  )}
                </TableCell>
                <TableCell>
                  {s.disabled ? (
                    <Badge variant='outline'>Отключён</Badge>
                  ) : (
                    <Badge variant='secondary'>Активен</Badge>
                  )}
                </TableCell>
                <TableCell className='space-x-1 text-right whitespace-nowrap'>
                  <Button
                    variant='ghost'
                    size='sm'
                    onClick={() => {
                      setPwdFor(s)
                      setNewPwd(generatePassword())
                    }}
                  >
                    Новый пароль
                  </Button>
                  <Button
                    variant='ghost'
                    size='sm'
                    onClick={() =>
                      setDraft({
                        id: s.id,
                        isOwner: s.isOwner,
                        firstName: s.firstName,
                        lastName: s.lastName,
                        phone: s.phone ?? '+998 ',
                        roleId: s.role?.id ?? '',
                        password: '',
                        disabled: s.disabled,
                      })
                    }
                  >
                    Изменить
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={draft !== null} onOpenChange={(v) => !v && setDraft(null)}>
        <DialogContent className='max-h-[90svh] overflow-y-auto sm:max-w-lg'>
          <DialogHeader>
            <DialogTitle>
              {draft?.id ? 'Сотрудник' : 'Новый сотрудник'}
            </DialogTitle>
            <DialogDescription>
              Вход в админку — по телефону и паролю. Что сотрудник видит и
              меняет — задаёт его роль.
            </DialogDescription>
          </DialogHeader>
          {draft && (
            <div className='grid gap-3'>
              <div className='grid grid-cols-2 gap-3'>
                <Field label='Имя'>
                  <Input
                    value={draft.firstName}
                    onChange={(e) =>
                      setDraft({ ...draft, firstName: e.target.value })
                    }
                  />
                </Field>
                <Field label='Фамилия'>
                  <Input
                    value={draft.lastName}
                    onChange={(e) =>
                      setDraft({ ...draft, lastName: e.target.value })
                    }
                  />
                </Field>
              </div>
              <Field label='Телефон' hint='Логин для входа'>
                <Input
                  type='tel'
                  inputMode='tel'
                  value={draft.phone}
                  onChange={(e) =>
                    setDraft({ ...draft, phone: e.target.value })
                  }
                />
              </Field>
              {!draft.id && (
                <PasswordField
                  value={draft.password}
                  onChange={(password) => setDraft({ ...draft, password })}
                />
              )}
              {draft.isOwner ? (
                <p className='text-sm text-muted-foreground'>
                  Владелец: все разделы, сотрудники и роли.
                </p>
              ) : (
                <div className='grid gap-1.5'>
                  <span className='text-sm font-medium'>Роль</span>
                  <Select
                    value={draft.roleId}
                    onValueChange={(roleId) => setDraft({ ...draft, roleId })}
                  >
                    <SelectTrigger className='w-full' aria-label='Роль'>
                      <SelectValue placeholder='Выберите роль' />
                    </SelectTrigger>
                    <SelectContent>
                      {roles.map((r) => (
                        <SelectItem key={r.id} value={r.id}>
                          {r.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className='text-xs text-muted-foreground'>
                    Права ролей настраиваются в разделе «Роли».
                  </p>
                </div>
              )}
              {draft.id && !draft.isOwner && !isSelf(draft.id) && (
                <label className='flex items-center gap-2 text-sm'>
                  <Switch
                    checked={!draft.disabled}
                    onCheckedChange={(v) =>
                      setDraft({ ...draft, disabled: !v })
                    }
                  />
                  Доступ в админку открыт
                </label>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant='outline' onClick={() => setDraft(null)}>
              Отмена
            </Button>
            <Button
              disabled={!valid || create.isPending || update.isPending}
              onClick={save}
            >
              {draft?.id ? 'Сохранить' : 'Добавить'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={pwdFor !== null}
        onOpenChange={(v) => !v && setPwdFor(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Новый пароль</DialogTitle>
            <DialogDescription>
              {pwdFor?.name}: все текущие входы закроются, сотрудник войдёт с
              новым паролем.
            </DialogDescription>
          </DialogHeader>
          <PasswordField value={newPwd} onChange={setNewPwd} />
          <DialogFooter>
            <Button variant='outline' onClick={() => setPwdFor(null)}>
              Отмена
            </Button>
            <Button
              disabled={newPwd.length < MIN_PASSWORD || setPassword.isPending}
              onClick={() =>
                pwdFor &&
                setPassword.mutate(
                  { id: pwdFor.id, password: newPwd },
                  { onSuccess: () => setPwdFor(null) }
                )
              }
            >
              Сохранить пароль
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  )
}
