import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { api } from '@/lib/api'

/* Типы — как отдаёт API (`apps/api/src/modules/admin`). Деньги — строки целых сумов. */
export type Category = {
  id: string
  slug: string
  nameRu: string
  nameUz: string
  enabled: boolean
  sortOrder: number
  lots: number
  products: number
}
export type Inspection = {
  summary: string
  battery: number | null
  imeiChecked: boolean
  kit: string[]
  defects: string[]
}
export type ProductStatus = 'AVAILABLE' | 'IN_LOT' | 'SOLD' | 'ARCHIVED'
export type Product = {
  id: string
  categoryId: string
  category: { slug: string; name: string }
  title: string
  condition: 'NEW' | 'USED'
  description: string
  inspection: Inspection
  imeiLast4: string | null
  inventoryNo: string | null
  costPrice: string | null
  status: ProductStatus
  createdAt: string
}
export type LotStatus =
  | 'DRAFT'
  | 'SCHEDULED'
  | 'LIVE'
  | 'CLOSED_SOLD'
  | 'CLOSED_UNSOLD'
  | 'UNDER_REVIEW'
  | 'CANCELLED'
export type Lot = {
  id: string
  status: LotStatus
  title: string
  description: string
  condition: 'NEW' | 'USED'
  categoryName: string
  productId: string | null
  startPrice: string
  step: string
  fee: string
  currentPrice: string | null
  admittedCount: number
  inspection: Inspection
  opensAt: string
  closesAt: string
}
export type Restriction = {
  id: string
  reason: string
  startsAt: string
  endsAt: string
  liftedAt: string | null
  liftReason: string | null
}
export type ParticipantRow = {
  id: string
  telegramId: string
  firstName: string
  lastName: string | null
  username: string | null
  publicName: string
  phone: string | null
  admissions: number
  restrictedUntil: string | null
}
export type ParticipantCard = Omit<
  ParticipantRow,
  'admissions' | 'restrictedUntil'
> & {
  restriction: Restriction | null
  restrictions: Restriction[]
  admissions: {
    lotId: string
    title: string
    lotStatus: LotStatus
    opensAt: string
    canCancel: boolean
  }[]
}
export type AuditEntry = {
  id: string
  createdAt: string
  actor: string
  action: string
  entityType: string
  entityId: string | null
  reason: string | null
  meta: Record<string, unknown>
}

/** Запрос + сброс связанных списков + понятное уведомление об успехе (ошибки показывает глобальный обработчик). */
function useAction<V, R = unknown>(
  fn: (v: V) => Promise<R>,
  invalidate: string[][],
  success?: string
) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: async () => {
      await Promise.all(
        invalidate.map((queryKey) => qc.invalidateQueries({ queryKey }))
      )
      if (success) toast.success(success)
    },
  })
}

/* Категории */
export const useCategories = () =>
  useQuery({
    queryKey: ['categories'],
    queryFn: () => api<Category[]>('/admin/categories'),
  })
export type CategoryInput = {
  slug?: string
  nameRu: string
  nameUz: string
  enabled: boolean
  sortOrder: number
}
export const useSaveCategory = () =>
  useAction(
    ({ id, ...body }: CategoryInput & { id?: string }) =>
      id
        ? api<Category>(`/admin/categories/${id}`, {
            method: 'PATCH',
            body: { ...body, slug: undefined },
          })
        : api<Category>('/admin/categories', { method: 'POST', body }),
    [['categories']],
    'Категория сохранена'
  )

/* Товары */
export const useProducts = (status?: ProductStatus) =>
  useQuery({
    queryKey: ['products', status ?? 'all'],
    queryFn: () =>
      api<Product[]>(`/admin/products${status ? `?status=${status}` : ''}`),
  })
export type ProductInput = {
  categoryId: string
  title: string
  condition: 'NEW' | 'USED'
  description: string
  inspection: Inspection
  imei?: string
  inventoryNo?: string
  costPrice?: string
}
export const useSaveProduct = () =>
  useAction(
    ({ id, ...body }: ProductInput & { id?: string }) =>
      id
        ? api<Product>(`/admin/products/${id}`, { method: 'PATCH', body })
        : api<Product>('/admin/products', { method: 'POST', body }),
    [['products'], ['categories']],
    'Товар сохранён'
  )

/* Лоты */
export const useLots = () =>
  useQuery({ queryKey: ['lots'], queryFn: () => api<Lot[]>('/admin/lots') })
export type LotInput = {
  startPrice: string
  step: string
  fee: string
  opensAt: string
  closesAt: string
  title?: string
  description?: string
}
export const useCreateLot = () =>
  useAction(
    (body: LotInput & { productId: string }) =>
      api<Lot>('/admin/lots', { method: 'POST', body }),
    [['lots'], ['products']],
    'Черновик лота создан'
  )
export const useUpdateLot = () =>
  useAction(
    ({ id, ...body }: Partial<LotInput> & { id: string }) =>
      api<Lot>(`/admin/lots/${id}`, { method: 'PATCH', body }),
    [['lots']],
    'Лот сохранён'
  )
export const usePublishLot = () =>
  useAction(
    (id: string) => api<Lot>(`/admin/lots/${id}/publish`, { method: 'POST' }),
    [['lots']],
    'Лот опубликован'
  )
export const useCancelLot = () =>
  useAction(
    ({ id, reason }: { id: string; reason: string }) =>
      api<Lot & { refunded: number; refundPending: number }>(
        `/admin/lots/${id}/cancel`,
        { method: 'POST', body: { reason } }
      ),
    [['lots'], ['products']],
    'Лот отменён, участникам оформлен возврат'
  )

/* Участники */
export const useParticipants = (q: string) =>
  useQuery({
    queryKey: ['participants', q],
    queryFn: () =>
      api<ParticipantRow[]>(`/admin/participants?q=${encodeURIComponent(q)}`),
    placeholderData: (prev) => prev,
  })
export const useParticipant = (id: string | null) =>
  useQuery({
    queryKey: ['participant', id],
    queryFn: () => api<ParticipantCard>(`/admin/participants/${id}`),
    enabled: Boolean(id),
  })
export const useRestrict = () =>
  useAction(
    ({
      userId,
      days,
      reason,
    }: {
      userId: string
      days: number
      reason: string
    }) =>
      api(`/admin/participants/${userId}/restrictions`, {
        method: 'POST',
        body: { days, reason },
      }),
    [['participants'], ['participant']],
    'Участие ограничено'
  )
export const useLift = () =>
  useAction(
    ({
      userId,
      restrictionId,
      reason,
    }: {
      userId: string
      restrictionId: string
      reason: string
    }) =>
      api(`/admin/participants/${userId}/restrictions/${restrictionId}/lift`, {
        method: 'POST',
        body: { reason },
      }),
    [['participants'], ['participant']],
    'Ограничение снято'
  )
export const useCancelAdmission = () =>
  useAction(
    ({
      userId,
      lotId,
      reason,
    }: {
      userId: string
      lotId: string
      reason: string
    }) =>
      api(`/admin/participants/${userId}/admissions/${lotId}/cancel`, {
        method: 'POST',
        body: { reason },
      }),
    [['participants'], ['participant'], ['lots']],
    'Допуск отменён, оформлен возврат'
  )

/* Журнал */
export const useAudit = () =>
  useQuery({
    queryKey: ['audit'],
    queryFn: () => api<AuditEntry[]>('/admin/audit'),
  })

/* Сотрудники */
export type Staff = {
  id: string
  name: string
  firstName: string
  lastName: string
  phone: string | null
  email: string | null
  isOwner: boolean
  role: { id: string; name: string } | null
  disabled: boolean
}
export const useStaff = () =>
  useQuery({ queryKey: ['staff'], queryFn: () => api<Staff[]>('/admin/staff') })
export type StaffInput = {
  firstName: string
  lastName: string
  phone: string
  roleId?: string
}
export const useCreateStaff = () =>
  useAction(
    (body: StaffInput & { password: string }) =>
      api<Staff>('/admin/staff', { method: 'POST', body }),
    [['staff']],
    'Сотрудник добавлен'
  )
export const useUpdateStaff = () =>
  useAction(
    ({
      id,
      ...body
    }: Partial<StaffInput> & { id: string; disabled?: boolean }) =>
      api<Staff>(`/admin/staff/${id}`, { method: 'PATCH', body }),
    [['staff']],
    'Сохранено'
  )
export const useSetStaffPassword = () =>
  useAction(
    ({ id, password }: { id: string; password: string }) =>
      api<void>(`/admin/staff/${id}/password`, {
        method: 'POST',
        body: { password },
      }),
    [['staff']],
    'Пароль изменён — старые входы закрыты'
  )

/* Роли */
export type Level = 'none' | 'view' | 'edit'
export type RoleRow = {
  id: string
  name: string
  permissions: Partial<Record<string, 'view' | 'edit'>>
  staff: number
}
export const useRoles = () =>
  useQuery({
    queryKey: ['roles'],
    queryFn: () => api<{ modules: string[]; roles: RoleRow[] }>('/admin/roles'),
  })
export const useSaveRole = () =>
  useAction(
    ({
      id,
      ...body
    }: {
      id?: string
      name: string
      permissions: Record<string, Level>
    }) =>
      id
        ? api<RoleRow>(`/admin/roles/${id}`, { method: 'PATCH', body })
        : api<RoleRow>('/admin/roles', { method: 'POST', body }),
    [['roles'], ['staff']],
    'Роль сохранена — права действуют сразу'
  )
export const useDeleteRole = () =>
  useAction(
    (id: string) => api<void>(`/admin/roles/${id}`, { method: 'DELETE' }),
    [['roles']],
    'Роль удалена'
  )
