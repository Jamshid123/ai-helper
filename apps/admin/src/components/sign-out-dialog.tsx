import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { toast } from 'sonner'
import { useAuthStore } from '@/stores/auth-store'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { logout } from '@/features/auth/api'

interface SignOutDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function SignOutDialog({ open, onOpenChange }: SignOutDialogProps) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const reset = useAuthStore((s) => s.reset)

  const handleSignOut = async () => {
    try {
      await logout()
    } catch {
      toast.error(
        'Не удалось завершить сессию на сервере. Данные на этом устройстве очищены.'
      )
    }
    reset()
    queryClient.clear()
    navigate({ to: '/sign-in', replace: true })
  }

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title='Выйти из админки?'
      desc='Чтобы вернуться, понадобятся пароль и код из приложения-аутентификатора.'
      confirmText='Выйти'
      cancelBtnText='Отмена'
      destructive
      handleConfirm={handleSignOut}
      className='sm:max-w-sm'
    />
  )
}
