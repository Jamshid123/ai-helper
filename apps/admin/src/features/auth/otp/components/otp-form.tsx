import { z } from 'zod'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { Loader2 } from 'lucide-react'
import { useAuthStore } from '@/stores/auth-store'
import { ApiError } from '@/lib/api'
import { safeRedirect } from '@/lib/safe-redirect'
import { cn } from '@/lib/utils'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSeparator,
  InputOTPSlot,
} from '@/components/ui/input-otp'
import { verifyMfa } from '../../api'
import { forgetEnrollment } from '../../enrollment'
import { meQueryKey } from '../../queries'

const formSchema = z.object({
  otp: z.string().regex(/^\d{6}$/, 'Введите 6 цифр.'),
})

type OtpFormProps = React.HTMLAttributes<HTMLFormElement> & {
  challengeId: string
  redirectTo?: string
}

function errorText(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401) return 'Неверный или устаревший код.'
    if (error.status === 410)
      return 'Сессия входа истекла. Вернитесь и введите пароль снова.'
    if (error.status === 429)
      return 'Слишком много попыток. Подождите несколько минут.'
  }
  return 'Не удалось проверить код. Попробуйте ещё раз.'
}

export function OtpForm({
  className,
  challengeId,
  redirectTo,
  ...props
}: OtpFormProps) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const setUser = useAuthStore((s) => s.setUser)

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: { otp: '' },
  })

  // eslint-disable-next-line react-hooks/incompatible-library
  const otp = form.watch('otp')

  const mutation = useMutation({
    mutationFn: (code: string) => verifyMfa(challengeId, code),
    meta: { silent: true },
    onSuccess: (user) => {
      forgetEnrollment()
      setUser(user)
      queryClient.setQueryData(meQueryKey, user)
      navigate({ to: safeRedirect(redirectTo), replace: true })
    },
    onError: () => form.resetField('otp'),
  })

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit((v) => mutation.mutate(v.otp))}
        className={cn('grid gap-2', className)}
        {...props}
      >
        {mutation.isError && (
          <Alert variant='destructive'>
            <AlertDescription>{errorText(mutation.error)}</AlertDescription>
          </Alert>
        )}
        <FormField
          control={form.control}
          name='otp'
          render={({ field }) => (
            <FormItem>
              <FormLabel className='sr-only'>Код подтверждения</FormLabel>
              <FormControl>
                <InputOTP
                  maxLength={6}
                  inputMode='numeric'
                  autoComplete='one-time-code'
                  autoFocus
                  {...field}
                  containerClassName='justify-between sm:[&>[data-slot="input-otp-group"]>div]:w-12'
                >
                  <InputOTPGroup>
                    <InputOTPSlot index={0} />
                    <InputOTPSlot index={1} />
                    <InputOTPSlot index={2} />
                  </InputOTPGroup>
                  <InputOTPSeparator />
                  <InputOTPGroup>
                    <InputOTPSlot index={3} />
                    <InputOTPSlot index={4} />
                    <InputOTPSlot index={5} />
                  </InputOTPGroup>
                </InputOTP>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button
          className='mt-2'
          disabled={otp.length < 6 || mutation.isPending}
        >
          {mutation.isPending && <Loader2 className='animate-spin' />}
          Войти
        </Button>
      </form>
    </Form>
  )
}
