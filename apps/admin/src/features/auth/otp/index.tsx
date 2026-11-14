import { Link, useSearch } from '@tanstack/react-router'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { QrCode } from '@/components/qr-code'
import { AuthLayout } from '../auth-layout'
import { enrollmentFor } from '../enrollment'
import { OtpForm } from './components/otp-form'

export function Otp() {
  const { challenge, redirect } = useSearch({ from: '/(auth)/otp' })
  const enroll = enrollmentFor(challenge ?? '')

  return (
    <AuthLayout>
      <Card className='max-w-md gap-4'>
        <CardHeader>
          <CardTitle className='text-base tracking-tight'>
            {enroll ? 'Подключите код подтверждения' : 'Код подтверждения'}
          </CardTitle>
          <CardDescription>
            {enroll
              ? 'Первый вход: отсканируйте QR-код в приложении-аутентификаторе (Google Authenticator, Aegis, 1Password и т.п.) и введите появившийся 6-значный код.'
              : 'Введите 6-значный код из приложения-аутентификатора (Google Authenticator, Aegis, 1Password и т.п.).'}
          </CardDescription>
        </CardHeader>
        <CardContent className='grid gap-4'>
          {enroll && (
            <div className='grid justify-items-center gap-2 rounded-lg border p-3'>
              <QrCode
                value={enroll.otpauthUrl}
                label='QR-код для приложения-аутентификатора'
              />
              <p className='text-center text-xs text-muted-foreground'>
                Не сканируется? Введите ключ вручную:
              </p>
              <code className='text-center font-mono text-sm tracking-wider break-all select-all'>
                {enroll.secret.match(/.{1,4}/g)?.join(' ')}
              </code>
            </div>
          )}
          <OtpForm challengeId={challenge ?? ''} redirectTo={redirect} />
        </CardContent>
        <CardFooter>
          <p className='text-sm text-muted-foreground'>
            Потеряли доступ к приложению? Попросите администратора сбросить MFA.{' '}
            <Link
              to='/sign-in'
              className='text-brand-ink underline underline-offset-4'
            >
              Вернуться ко входу
            </Link>
          </p>
        </CardFooter>
      </Card>
    </AuthLayout>
  )
}
