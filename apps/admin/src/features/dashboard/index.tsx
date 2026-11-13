import { useEffect, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { SECTION_LIST } from '@/config/sections'
import { canAccess } from '@/lib/rbac'
import { SESSION_TZ, currentOrNextSession } from '@/lib/session-time'
import { useAuthStore } from '@/stores/auth-store'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { PageShell } from '@/components/layout/page-shell'

const dateFmt = new Intl.DateTimeFormat('ru-RU', {
  timeZone: SESSION_TZ,
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  hour: '2-digit',
  minute: '2-digit',
})

function formatLeft(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const d = Math.floor(total / 86_400)
  const h = Math.floor((total % 86_400) / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const hms = [h, m, s].map((n) => String(n).padStart(2, '0')).join(':')
  return d > 0 ? `${d} д ${hms}` : hms
}

function useNow(intervalMs = 1000): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
  return now
}

export function Dashboard() {
  const now = useNow()
  const session = currentOrNextSession(now)
  const roles = useAuthStore((s) => s.user?.roles ?? [])
  const sections = SECTION_LIST.filter((s) => s.id !== 'dashboard' && canAccess(roles, s.id))

  return (
    <PageShell title='Обзор' description='Время показано по Ташкенту. Точное расписание задаёт сервер.'>
      <div className='grid gap-4 lg:grid-cols-3'>
        <Card className='lg:col-span-1'>
          <CardHeader>
            <CardDescription>{session.isLive ? 'Торги идут' : 'Ближайшие торги'}</CardDescription>
            <CardTitle className='text-3xl font-semibold tabular-nums'>
              {formatLeft((session.isLive ? session.closesAt : session.opensAt).getTime() - now.getTime())}
            </CardTitle>
          </CardHeader>
          <CardContent className='text-sm text-muted-foreground'>
            {session.isLive ? 'Приём ставок до ' : 'Открытие: '}
            {dateFmt.format(session.isLive ? session.closesAt : session.opensAt)}
          </CardContent>
        </Card>

        <Card className='lg:col-span-2'>
          <CardHeader>
            <CardTitle className='text-base'>Ваши разделы</CardTitle>
            <CardDescription>Доступ определяется ролями учётной записи.</CardDescription>
          </CardHeader>
          <CardContent className='grid gap-2 sm:grid-cols-2'>
            {sections.map((s) => (
              <Link
                key={s.id}
                to={s.url}
                className='flex items-start gap-3 rounded-md border p-3 transition-colors hover:bg-accent focus-visible:outline-2'
              >
                <s.icon className='mt-0.5 size-4 shrink-0 text-muted-foreground' />
                <span className='grid gap-0.5'>
                  <span className='text-sm font-medium'>{s.title}</span>
                  <span className='text-xs text-muted-foreground'>{s.description}</span>
                </span>
              </Link>
            ))}
          </CardContent>
        </Card>
      </div>
    </PageShell>
  )
}
