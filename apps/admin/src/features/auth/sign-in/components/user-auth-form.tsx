import { z } from 'zod'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { Loader2, LogIn } from 'lucide-react'
import { ApiError } from '@/lib/api'
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

const formSchema = z.object({
  email: z.email({
    error: (iss) => (iss.input === '' ? 'Введите email.' : 'Неверный формат email.'),
  }),
  password: z.string().min(1, 'Введите пароль.'),
})

type FormValues = z.infer<typeof formSchema>

interface UserAuthFormProps extends React.HTMLAttributes<HTMLFormElement> {
  redirectTo?: string
}

function errorText(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401) return 'Неверный email или пароль.'
    if (error.status === 423) return 'Учётная запись временно заблокирована. Обратитесь к администратору.'
    if (error.status === 429) return 'Слишком много попыток. Подождите несколько минут.'
  }
  return 'Не удалось войти. Проверьте соединение и попробуйте ещё раз.'
}

export function UserAuthForm({ className, redirectTo, ...props }: UserAuthFormProps) {
  const navigate = useNavigate()
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { email: '', password: '' },
  })

  const mutation = useMutation({
    mutationFn: (v: FormValues) => login(v.email, v.password),
    meta: { silent: true },
    onSuccess: ({ challengeId }) => {
      form.resetField('password')
      navigate({ to: '/otp', search: { challenge: challengeId, redirect: redirectTo } })
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
          name='email'
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email</FormLabel>
              <FormControl>
                <Input type='email' autoComplete='username' placeholder='name@company.uz' {...field} />
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
          {mutation.isPending ? <Loader2 className='animate-spin' /> : <LogIn />}
          Продолжить
        </Button>
      </form>
    </Form>
  )
}
