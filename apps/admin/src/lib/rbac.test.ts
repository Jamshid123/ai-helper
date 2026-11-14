import { describe, expect, it } from 'vitest'
import { SECTIONS, canAccess, canEdit } from './rbac'

describe('права в админке', () => {
  it('без сотрудника или прав — только ничего; обзор виден любому вошедшему', () => {
    for (const s of SECTIONS) expect(canAccess(null, s)).toBe(false)
    expect(canAccess({ permissions: {} }, 'dashboard')).toBe(true)
    expect(canAccess({ permissions: {} }, 'lots')).toBe(false)
  })

  it('«просмотр» показывает раздел без действий, «изменение» — с действиями', () => {
    const a = {
      permissions: { lots: 'view' as const, products: 'edit' as const },
    }
    expect(canAccess(a, 'lots')).toBe(true)
    expect(canEdit(a, 'lots')).toBe(false)
    expect(canEdit(a, 'products')).toBe(true)
  })

  it('сотрудники и роли — только владелец, даже если права роли подделаны', () => {
    const forged = {
      permissions: { staff: 'edit' as const, roles: 'edit' as const },
    }
    expect(canAccess(forged, 'staff')).toBe(false)
    expect(canAccess(forged, 'roles')).toBe(false)
    expect(canEdit({ isOwner: true }, 'staff')).toBe(true)
    for (const s of SECTIONS) expect(canEdit({ isOwner: true }, s)).toBe(true)
  })

  it('неизвестный уровень не даёт доступа', () => {
    expect(canAccess({ permissions: { lots: 'admin' as never } }, 'lots')).toBe(
      false
    )
  })
})
