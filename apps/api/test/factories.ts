import { randomUUID } from 'node:crypto'
import { Prisma, PrismaClient } from '@prisma/client'

/** Фабрики тестовых данных. Без реальных ПДн: телефоны вида +99890000xxxx. */
let n = 0
const next = () => ++n

export async function cleanDb(db: PrismaClient) {
  await db.$executeRawUnsafe(
    'TRUNCATE "Bid","AutoBid","LotReminder","Admission","Obligation","Order","Restriction","Lot","Product","User","OutboxEvent","AuditLog","Setting","StaffSession","Staff" CASCADE'
  )
  // роли засеяны миграцией: тестовые удаляем, стартовые возвращаем к исходным правам
  await db.role.deleteMany({ where: { name: { notIn: ['Администратор', 'Оператор'] } } })
  const seeds = {
    Администратор: {
      schedule: 'edit',
      categories: 'edit',
      products: 'edit',
      lots: 'edit',
      sellers: 'edit',
      inspection: 'edit',
      risk: 'edit',
      participants: 'edit',
      finance: 'edit',
      fulfillment: 'edit',
      audit: 'view',
    },
    Оператор: { categories: 'edit', products: 'edit', lots: 'edit', participants: 'view' },
  }
  for (const [name, permissions] of Object.entries(seeds)) {
    await db.role.upsert({ where: { name }, create: { name, permissions }, update: { permissions } })
  }
  // категории засеяны миграцией: возвращаем стартовое состояние, лишние удаляем
  await db.category.deleteMany({ where: { slug: { notIn: ['phones', 'travel'] } } })
  await db.category.update({
    where: { slug: 'phones' },
    data: { nameRu: 'Телефоны', nameUz: 'Telefonlar', enabled: true, sortOrder: 10 },
  })
  await db.category.update({
    where: { slug: 'travel' },
    data: { nameRu: 'Путешествия', nameUz: 'Sayohatlar', enabled: false, sortOrder: 20 },
  })
}

export function createUser(db: PrismaClient, data: Partial<Prisma.UserCreateInput> = {}) {
  const i = next()
  return db.user.create({
    data: {
      telegramId: BigInt(1_000_000 + i),
      firstName: `Тест${i}`,
      publicName: `Участник ${String(i).padStart(4, '0')}`,
      ...data,
    },
  })
}

export function createLot(db: PrismaClient, data: Partial<Prisma.LotCreateInput> = {}) {
  const now = Date.now()
  return db.lot.create({
    data: {
      title: `Телефон ${next()}`,
      condition: 'USED',
      startPrice: 2_000_000n,
      step: 100_000n,
      fee: 12_000n,
      status: 'LIVE',
      opensAt: new Date(now - 3_600_000),
      closesAt: new Date(now + 3_600_000),
      category: { connect: { slug: 'phones' } },
      ...data,
    },
  })
}

export const key = () => randomUUID()
