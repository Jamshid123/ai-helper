import { currentOrNextSession } from '@auksion/shared'
import { type Lot } from './types'

/**
 * Тестовые лоты для демо-стенда. Цены и модели правдоподобные, но вымышленные.
 * Чтобы партнёры могли попробовать ставки в любой день, первые два лота
 * в демо «идут прямо сейчас» с окончанием через 3 часа. На проде так не бывает:
 * торги — только в пятницу 09:00–18:00 по Ташкенту.
 */
type Seed = Omit<Lot, 'opensAt' | 'closesAt' | 'status' | 'currentPrice' | 'seller' | 'category'>

const SEEDS: Seed[] = [
  {
    id: 'ip14p-256',
    title: 'iPhone 14 Pro, 256 ГБ',
    condition: 'used',
    startPrice: '7200000',
    step: '100000',
    admittedCount: 23,
    fee: '12000',
    inspection: {
      summary: 'Корпус без сколов, экран без царапин, Face ID работает',
      battery: 89,
      imeiChecked: true,
      kit: ['Телефон', 'Кабель USB-C — Lightning', 'Коробка'],
      defects: ['Лёгкие потёртости рамки у разъёма'],
    },
    hue: 268,
  },
  {
    id: 'sgs24-128',
    title: 'Samsung Galaxy S24, 128 ГБ',
    condition: 'new',
    startPrice: '6900000',
    step: '100000',
    admittedCount: 17,
    fee: '12000',
    inspection: {
      summary: 'Новый, в заводской плёнке, официальная поставка',
      battery: null,
      imeiChecked: true,
      kit: ['Телефон', 'Кабель USB-C', 'Скрепка', 'Документы'],
      defects: [],
    },
    hue: 210,
  },
  {
    id: 'xm14-512',
    title: 'Xiaomi 14, 512 ГБ',
    condition: 'used',
    startPrice: '5400000',
    step: '100000',
    admittedCount: 9,
    fee: '12000',
    inspection: {
      summary: 'Все функции работают, следов ремонта нет',
      battery: 93,
      imeiChecked: true,
      kit: ['Телефон', 'Зарядное устройство 90 Вт', 'Чехол'],
      defects: [],
    },
    hue: 150,
  },
  {
    id: 'ip15-128',
    title: 'iPhone 15, 128 ГБ',
    condition: 'new',
    startPrice: '8100000',
    step: '100000',
    admittedCount: 31,
    fee: '12000',
    inspection: {
      summary: 'Новый, запечатан',
      battery: null,
      imeiChecked: true,
      kit: ['Телефон', 'Кабель USB-C', 'Документы'],
      defects: [],
    },
    hue: 40,
  },
  {
    id: 'px8-128',
    title: 'Google Pixel 8, 128 ГБ',
    condition: 'used',
    startPrice: '3900000',
    step: '100000',
    admittedCount: 6,
    fee: '12000',
    inspection: {
      summary: 'Работает исправно, заменялось защитное стекло',
      battery: 86,
      imeiChecked: true,
      kit: ['Телефон', 'Кабель USB-C'],
      defects: ['Царапина на задней панели 4 мм'],
    },
    hue: 0,
  },
]

export function buildDemoLots(now: Date): Lot[] {
  const session = currentOrNextSession(now)
  const liveClose = new Date(now.getTime() + 3 * 3_600_000)
  return SEEDS.map((s, i) => {
    const live = i < 2
    return {
      ...s,
      category: 'phones',
      seller: 'platform',
      currentPrice: null,
      status: live ? 'live' : 'scheduled',
      opensAt: (live ? new Date(now.getTime() - 3_600_000) : session.opensAt).toISOString(),
      closesAt: (live ? liveClose : session.closesAt).toISOString(),
    }
  })
}
