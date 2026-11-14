import { describe, expect, it } from 'vitest'
import { SECTIONS, canAccess } from './rbac'

describe('canAccess', () => {
  it('без ролей нет доступа ни к одному разделу', () => {
    for (const s of SECTIONS) expect(canAccess([], s)).toBe(false)
  })

  it('неизвестная роль не даёт доступа', () => {
    expect(canAccess(['SUPERUSER'], 'dashboard')).toBe(false)
    expect(canAccess(['admin'], 'staff')).toBe(false)
  })

  it('эксперт видит экспертизу, но не финансы и не сотрудников', () => {
    expect(canAccess(['EXPERT'], 'inspection')).toBe(true)
    expect(canAccess(['EXPERT'], 'finance')).toBe(false)
    expect(canAccess(['EXPERT'], 'staff')).toBe(false)
  })

  it('поддержка видит ограничения участия, но не сигналы риска', () => {
    expect(canAccess(['SUPPORT'], 'participants')).toBe(true)
    expect(canAccess(['SUPPORT'], 'risk')).toBe(false)
  })

  it('управление сотрудниками и аудит — только у администратора', () => {
    for (const r of [
      'OPERATOR',
      'EXPERT',
      'RISK',
      'FINANCE',
      'FULFILLMENT',
      'SUPPORT',
    ]) {
      expect(canAccess([r], 'staff')).toBe(false)
      expect(canAccess([r], 'audit')).toBe(false)
    }
    expect(canAccess(['ADMIN'], 'staff')).toBe(true)
  })

  it('несколько ролей объединяют доступ', () => {
    expect(canAccess(['EXPERT', 'FULFILLMENT'], 'fulfillment')).toBe(true)
  })
})
