import { createFileRoute, redirect } from '@tanstack/react-router'
import { useAuthStore } from '@/stores/auth-store'
import { AuthenticatedLayout } from '@/components/layout/authenticated-layout'
import { meQuery } from '@/features/auth/queries'

function isUnauthorized(e: unknown): boolean {
  return (
    typeof e === 'object' &&
    e !== null &&
    'status' in e &&
    (e as { status: number }).status === 401
  )
}

export const Route = createFileRoute('/_authenticated')({
  beforeLoad: async ({ context, location }) => {
    try {
      const user = await context.queryClient.ensureQueryData(meQuery)
      useAuthStore.getState().setUser(user)
      return { user }
    } catch (e) {
      if (isUnauthorized(e)) {
        useAuthStore.getState().reset()
        throw redirect({ to: '/sign-in', search: { redirect: location.href } })
      }
      throw e
    }
  },
  component: AuthenticatedLayout,
})
