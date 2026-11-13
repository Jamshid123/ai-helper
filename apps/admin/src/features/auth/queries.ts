import { queryOptions } from '@tanstack/react-query'
import { fetchMe } from './api'

export const meQueryKey = ['admin', 'me'] as const

export const meQuery = queryOptions({
  queryKey: meQueryKey,
  queryFn: fetchMe,
  staleTime: 60_000,
  retry: false,
})
