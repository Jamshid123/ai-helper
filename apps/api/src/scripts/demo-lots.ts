import type { Prisma, PrismaClient } from '@prisma/client'
import { currentOrNextSession } from '@auksion/shared'

/**
 * Тестовые лоты демо-стенда (решение заказчика 14.11.2026). Модели и цены правдоподобные, но вымышленные.
 * Все лоты заводятся как SCHEDULED: открывает и закрывает их только расписание (LifecycleScheduler).
 * Первые два открываются сразу и идут до конца ближайшей пятничной сессии, остальные — на следующую сессию.
 * Допуски, предложения и счётчики не подделываются.
 */
type Seed = Pick<Prisma.LotCreateInput, 'title' | 'condition' | 'startPrice' | 'inspection'>

const SEEDS: Seed[] = [
  {
    title: 'iPhone 14 Pro, 256 ГБ',
    condition: 'USED',
    startPrice: 7_200_000n,
    inspection: {
      summary: 'Корпус без сколов, экран без царапин, Face ID работает',
      battery: 89,
      imeiChecked: true,
      kit: ['Телефон', 'Кабель USB-C — Lightning', 'Коробка'],
      defects: ['Лёгкие потёртости рамки у разъёма'],
    },
  },
  {
    title: 'Samsung Galaxy S24, 128 ГБ',
    condition: 'NEW',
    startPrice: 6_900_000n,
    inspection: {
      summary: 'Новый, в заводской плёнке, официальная поставка',
      battery: null,
      imeiChecked: true,
      kit: ['Телефон', 'Кабель USB-C', 'Скрепка', 'Документы'],
      defects: [],
    },
  },
  {
    title: 'Xiaomi 14, 512 ГБ',
    condition: 'USED',
    startPrice: 5_400_000n,
    inspection: {
      summary: 'Все функции работают, следов ремонта нет',
      battery: 93,
      imeiChecked: true,
      kit: ['Телефон', 'Зарядное устройство 90 Вт', 'Чехол'],
      defects: [],
    },
  },
  {
    title: 'iPhone 15, 128 ГБ',
    condition: 'NEW',
    startPrice: 8_100_000n,
    inspection: {
      summary: 'Новый, запечатан',
      battery: null,
      imeiChecked: true,
      kit: ['Телефон', 'Кабель USB-C', 'Документы'],
      defects: [],
    },
  },
  {
    title: 'Google Pixel 8, 128 ГБ',
    condition: 'USED',
    startPrice: 3_900_000n,
    inspection: {
      summary: 'Работает исправно, заменялось защитное стекло',
      battery: 86,
      imeiChecked: true,
      kit: ['Телефон', 'Кабель USB-C'],
      defects: ['Царапина на задней панели 4 мм'],
    },
  },
]

const OPEN_NOW = 2

export async function seedDemoLots(db: PrismaClient, now: Date): Promise<{ created: number }> {
  const active = await db.lot.count({ where: { status: { in: ['SCHEDULED', 'LIVE'] } } })
  if (active > 0) throw new Error(`В базе уже есть идущие или запланированные лоты (${active}) — ничего не делаю`)

  const first = currentOrNextSession(now)
  const next = currentOrNextSession(new Date(first.closesAt.getTime() + 60_000))
  const data: Prisma.LotCreateManyInput[] = SEEDS.map((s, i) => {
    const openNow = i < OPEN_NOW
    return {
      title: s.title,
      condition: s.condition,
      startPrice: s.startPrice,
      inspection: s.inspection,
      step: 100_000n,
      fee: 12_000n,
      status: 'SCHEDULED',
      opensAt: openNow ? new Date(now.getTime() - 60_000) : next.opensAt,
      closesAt: openNow ? first.closesAt : next.closesAt,
    }
  })
  const r = await db.lot.createMany({ data })
  return { created: r.count }
}
