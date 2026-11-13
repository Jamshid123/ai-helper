import { z } from 'zod'
import { createFileRoute, redirect } from '@tanstack/react-router'
import { Otp } from '@/features/auth/otp'

const searchSchema = z.object({
  challenge: z.string().optional(),
  redirect: z.string().optional(),
})

export const Route = createFileRoute('/(auth)/otp')({
  validateSearch: searchSchema,
  beforeLoad: ({ search }) => {
    // Без челленджа от шага с паролем сюда попасть нельзя.
    if (!search.challenge) throw redirect({ to: '/sign-in' })
    return { challenge: search.challenge }
  },
  component: Otp,
})
