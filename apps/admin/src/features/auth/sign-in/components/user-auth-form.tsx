import { z } from 'zod'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { Loader2, LogIn } from 'lucide-react'
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
import { Input } from '@/components/ui/input'
import { PasswordInput } from '@/components/password-input'
import { login } from '../../api'
import { meQueryKey } from '../../queries'

const formSchema = z.object({
  // телефон (+998…); старые учётки без телефона входят по email — сервер различает сам
  login: z.string().trim().min(1, 'Введите телефон.'),
  password: z.string().min(1, 'Введите пароль.'),
})

type FormValues = z.infer<typeof formSchema>

interface UserAuthFormProps extends React.HTMLAttributes<HTMLFormElement> {
  redirectTo?: string
}

function errorText(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401) return 'Неверный телефон или пароль.'
    if (error.status === 423)
      return 'Учётная запись временно заблокирована. Обратитесь к администратору.'
    if (error.status === 429)
      return 'Слишком много попыток. Подождите несколько минут.'
  }
  return 'Не удалось войти. Проверьте соединение и попробуйте ещё раз.'
}

export function UserAuthForm({
  className,
  redirectTo,
  ...props
}: UserAuthFormProps) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const setUser = useAuthStore((s) => s.setUser)
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { login: '', password: '' },
  })

  const mutation = useMutation({
    mutationFn: (v: FormValues) => login(v.login, v.password),
    meta: { silent: true },
    onSuccess: (user) => {
      form.resetField('password')
      setUser(user)
      queryClient.setQueryData(meQueryKey, user)
      navigate({ to: safeRedirect(redirectTo), replace: true })
    },
  })

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit((v) => mutation.mutate(v))}
        className={cn('grid gap-3', className)}
        noValidate
        {...props}
      >
        {mutation.isError && (
          <Alert variant='destructive'>
            <AlertDescription>{errorText(mutation.error)}</AlertDescription>
          </Alert>
        )}
        <FormField
          control={form.control}
          name='login'
          render={({ field }) => (
            <FormItem>
              <FormLabel>Телефон</FormLabel>
              <FormControl>
                <Input
                  type='tel'
                  inputMode='tel'
                  autoComplete='username'
                  placeholder='+998 90 123 45 67'
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name='password'
          render={({ field }) => (
            <FormItem>
              <FormLabel>Пароль</FormLabel>
              <FormControl>
                <PasswordInput autoComplete='current-password' {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button className='mt-2' disabled={mutation.isPending}>
          {mutation.isPending ? (
            <Loader2 className='animate-spin' />
          ) : (
            <LogIn />
          )}
          Войти
        </Button>
      </form>
    </Form>
  )
}
