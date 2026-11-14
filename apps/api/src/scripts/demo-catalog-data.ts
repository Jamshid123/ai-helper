/**
 * Данные демо-каталога: правдоподобные, но вымышленные товары площадки (демо-стенд, 14.11.2026).
 * Фото — Wikimedia Commons, свободные лицензии; источники и авторы — `demo-media/CREDITS.md`.
 */
export type DemoCategory = { slug: string; ru: string; uz: string; sort: number }
export type DemoProduct = {
  inventoryNo: string
  category: string
  title: string
  condition: 'NEW' | 'USED'
  description: string
  inspection: { summary: string; battery: number | null; imeiChecked: boolean; kit: string[]; defects: string[] }
  costPrice: bigint
  startPrice: bigint
  step: bigint
  /** Через сколько минут после наполнения открываются торги и сколько длятся. */
  opensInMin: number
  durationMin: number
  minParticipants?: number
  maxParticipants?: number
  bidTimeoutSec?: number
  /** Файлы в `demo-media/`, первое — главное. */
  photos: string[]
}

export const CATEGORIES: DemoCategory[] = [
  { slug: 'phones', ru: 'Телефоны', uz: 'Telefonlar', sort: 10 },
  { slug: 'laptops', ru: 'Ноутбуки', uz: 'Noutbuklar', sort: 11 },
  { slug: 'tablets', ru: 'Планшеты', uz: 'Planshetlar', sort: 12 },
  { slug: 'watches', ru: 'Смарт-часы', uz: 'Aqlli soatlar', sort: 13 },
  { slug: 'audio', ru: 'Наушники', uz: 'Quloqchinlar', sort: 14 },
]

const H = 60
const D = 24 * H

/** Сокращение для акта проверки. */
const act = (summary: string, battery: number | null, kit: string[], defects: string[] = [], imeiChecked = true) => ({
  summary,
  battery,
  imeiChecked,
  kit,
  defects,
})

export const PRODUCTS: DemoProduct[] = [
  // ── Телефоны ──
  {
    inventoryNo: 'DEMO-001',
    category: 'phones',
    title: 'iPhone 13, 256 ГБ, белый',
    condition: 'USED',
    description:
      'Один владелец, куплен в официальном магазине. Всегда был в чехле и под защитным стеклом. Аккумулятор не менялся, Face ID и все камеры работают.',
    inspection: act(
      'Корпус и экран без сколов, Face ID, камеры, динамики и зарядка работают',
      86,
      ['Телефон', 'Кабель USB-C — Lightning', 'Коробка'],
      ['Микроцарапины на рамке у кнопки питания']
    ),
    costPrice: 4_200_000n,
    startPrice: 4_600_000n,
    step: 100_000n,
    opensInMin: 2,
    durationMin: 3 * D,
    photos: ['iphone-13-1.jpg', 'iphone-13-2.jpg'],
  },
  {
    inventoryNo: 'DEMO-002',
    category: 'phones',
    title: 'iPhone 12, 64 ГБ, синий',
    condition: 'USED',
    description: 'Рабочий телефон без ремонтов. Подойдёт как основной или для ребёнка.',
    inspection: act(
      'Работает исправно, следов вскрытия нет',
      81,
      ['Телефон', 'Кабель USB-C — Lightning'],
      ['Потёртости на задней панели']
    ),
    costPrice: 2_800_000n,
    startPrice: 3_100_000n,
    step: 100_000n,
    opensInMin: 1 * D,
    durationMin: 6 * H,
    maxParticipants: 30,
    bidTimeoutSec: 600,
    photos: ['iphone-12-1.jpg'],
  },
  {
    inventoryNo: 'DEMO-003',
    category: 'phones',
    title: 'Samsung Galaxy S21, 128 ГБ, фиолетовый',
    condition: 'USED',
    description: 'Экран без выгорания, обе SIM работают. Продаётся в связи с переходом на новую модель.',
    inspection: act('Экран без выгорания, камеры и зарядка работают', 84, ['Телефон', 'Кабель USB-C', 'Чехол']),
    costPrice: 2_300_000n,
    startPrice: 2_600_000n,
    step: 100_000n,
    opensInMin: 1 * D + 3 * H,
    durationMin: 1 * D,
    minParticipants: 3,
    photos: ['galaxy-s21-1.jpg'],
  },
  {
    inventoryNo: 'DEMO-004',
    category: 'phones',
    title: 'Samsung Galaxy S22, 256 ГБ, розовый',
    condition: 'USED',
    description: 'Компактный флагман в отличном состоянии, полный комплект с коробкой.',
    inspection: act('Как новый: без царапин, все функции работают', 90, [
      'Телефон',
      'Кабель USB-C',
      'Скрепка',
      'Коробка',
    ]),
    costPrice: 3_500_000n,
    startPrice: 3_900_000n,
    step: 100_000n,
    opensInMin: 2 * D,
    durationMin: 2 * H,
    bidTimeoutSec: 300,
    photos: ['galaxy-s22-1.jpg', 'galaxy-s22-2.jpg'],
  },
  {
    inventoryNo: 'DEMO-005',
    category: 'phones',
    title: 'Google Pixel 6, 128 ГБ, мятный',
    condition: 'USED',
    description: 'Чистый Android и отличная камера. Без следов ремонта.',
    inspection: act(
      'Работает исправно, заменялось защитное стекло',
      85,
      ['Телефон', 'Кабель USB-C'],
      ['Царапина 3 мм на задней панели']
    ),
    costPrice: 2_100_000n,
    startPrice: 2_400_000n,
    step: 100_000n,
    opensInMin: 2 * D + 4 * H,
    durationMin: 1 * D,
    photos: ['pixel-6-1.jpg'],
  },
  // ── Ноутбуки ──
  {
    inventoryNo: 'DEMO-006',
    category: 'laptops',
    title: 'MacBook Pro 14″ (2021), M1 Pro, 16/512 ГБ, серебристый',
    condition: 'USED',
    description:
      'Мощный ноутбук для работы с фото, видео и кодом. Экран Liquid Retina XDR, батареи хватает на рабочий день.',
    inspection: act('Экран и клавиатура без дефектов, 184 цикла зарядки', 92, [
      'Ноутбук',
      'Зарядное устройство 67 Вт',
      'Кабель USB-C — MagSafe 3',
    ]),
    costPrice: 13_500_000n,
    startPrice: 14_500_000n,
    step: 200_000n,
    opensInMin: 2,
    durationMin: 2 * D,
    photos: ['macbook-pro-14-1.jpg', 'macbook-pro-14-2.jpg'],
  },
  {
    inventoryNo: 'DEMO-007',
    category: 'laptops',
    title: 'MacBook Pro 14″, M5, 16/512 ГБ, чёрный космос',
    condition: 'NEW',
    description: 'Новый, официальная поставка. Самый свежий MacBook Pro на чипе M5.',
    inspection: act('Новый, в заводской упаковке', null, [
      'Ноутбук',
      'Зарядное устройство',
      'Кабель USB-C — MagSafe 3',
      'Документы',
    ]),
    costPrice: 21_000_000n,
    startPrice: 22_000_000n,
    step: 200_000n,
    opensInMin: 3 * D,
    durationMin: 1 * D,
    maxParticipants: 20,
    photos: ['macbook-pro-m5-1.jpg'],
  },
  {
    inventoryNo: 'DEMO-008',
    category: 'laptops',
    title: 'Lenovo ThinkPad T440p, 8/256 ГБ SSD',
    condition: 'USED',
    description: 'Надёжный рабочий ноутбук с лучшей клавиатурой в классе. Для учёбы, офиса и бухгалтерии.',
    inspection: act(
      'Клавиатура, тачпад и порты работают, экран без битых пикселей',
      74,
      ['Ноутбук', 'Зарядное устройство 90 Вт'],
      ['Потёртости на крышке']
    ),
    costPrice: 1_900_000n,
    startPrice: 2_200_000n,
    step: 100_000n,
    opensInMin: 1 * D + 6 * H,
    durationMin: 6 * H,
    bidTimeoutSec: 600,
    photos: ['thinkpad-t440p-1.jpg'],
  },
  // ── Планшеты ──
  {
    inventoryNo: 'DEMO-009',
    category: 'tablets',
    title: 'iPad 10-го поколения, 64 ГБ, Wi-Fi + Magic Keyboard Folio',
    condition: 'USED',
    description: 'Планшет с клавиатурой-обложкой: печатать, учиться и смотреть фильмы. Выставочный образец.',
    inspection: act('Экран без царапин, Touch ID, динамики и клавиатура работают', 95, [
      'Планшет',
      'Клавиатура Magic Keyboard Folio',
      'Кабель USB-C',
    ]),
    costPrice: 4_300_000n,
    startPrice: 4_800_000n,
    step: 100_000n,
    opensInMin: 2 * D + 2 * H,
    durationMin: 1 * D,
    photos: ['ipad-10-1.jpg'],
  },
  // ── Смарт-часы ──
  {
    inventoryNo: 'DEMO-010',
    category: 'watches',
    title: 'Apple Watch, 41 мм, алюминий, фиолетовый ремешок',
    condition: 'USED',
    description: 'Пульс, сон, тренировки и уведомления на запястье. Носились аккуратно.',
    inspection: act('Экран без сколов, датчики и зарядка работают', 88, [
      'Часы',
      'Зарядный кабель',
      'Спортивный ремешок',
    ]),
    costPrice: 2_000_000n,
    startPrice: 2_300_000n,
    step: 100_000n,
    opensInMin: 1 * D + 2 * H,
    durationMin: 1 * D,
    photos: ['apple-watch-1.jpg'],
  },
  {
    inventoryNo: 'DEMO-011',
    category: 'watches',
    title: 'Apple Watch Sport (1-го поколения), 42 мм',
    condition: 'USED',
    description: 'Первые Apple Watch: шаги, пульс и уведомления. Недорогой способ попробовать смарт-часы.',
    inspection: act(
      'Работают, аккумулятор держит день',
      72,
      ['Часы', 'Зарядный кабель', 'Зелёный спортивный ремешок'],
      ['Мелкие царапины на корпусе']
    ),
    costPrice: 500_000n,
    startPrice: 600_000n,
    step: 100_000n,
    opensInMin: 3 * D + 2 * H,
    durationMin: 6 * H,
    minParticipants: 2,
    photos: ['apple-watch-sport-1.jpg'],
  },
  // ── Наушники ──
  {
    inventoryNo: 'DEMO-012',
    category: 'audio',
    title: 'AirPods Pro 2',
    condition: 'USED',
    description: 'Активное шумоподавление и прозрачный режим работают. Амбушюры заменены на новые.',
    inspection: act(
      'Оба наушника и кейс работают, шумоподавление исправно',
      87,
      ['Наушники', 'Кейс', 'Кабель USB-C', 'Запасные амбушюры'],
      ['Потёртости на кейсе']
    ),
    costPrice: 1_500_000n,
    startPrice: 1_700_000n,
    step: 100_000n,
    opensInMin: 2,
    durationMin: 1 * D,
    photos: ['airpods-pro-2-1.jpg', 'airpods-pro-2-2.jpg'],
  },
]
