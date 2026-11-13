import { Link, useSearch } from '@tanstack/react-router'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { AuthLayout } from '../auth-layout'
import { OtpForm } from './components/otp-form'

export function Otp() {
  const { challenge, redirect } = useSearch({ from: '/(auth)/otp' })

  return (
    <AuthLayout>
      <Card className='max-w-md gap-4'>
        <CardHeader>
          <CardTitle className='text-base tracking-tight'>Код подтверждения</CardTitle>
          <CardDescription>
            Введите 6-значный код из приложения-аутентификатора
            (Google Authenticator, Aegis, 1Password и т.п.).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <OtpForm challengeId={challenge ?? ''} redirectTo={redirect} />
        </CardContent>
        <CardFooter>
          <p className='text-sm text-muted-foreground'>
            Потеряли доступ к приложению? Попросите администратора сбросить MFA.{' '}
            <Link to='/sign-in' className='underline underline-offset-4 hover:text-primary'>
              Вернуться ко входу
            </Link>
          </p>
        </CardFooter>
      </Card>
    </AuthLayout>
  )
}
