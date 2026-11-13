import {
  BadgeCheck,
  CalendarClock,
  ClipboardCheck,
  FileClock,
  Gavel,
  LayoutDashboard,
  PackageCheck,
  ShieldAlert,
  UserCog,
  UserMinus,
  Wallet,
} from 'lucide-react'
import { type Section } from '@/lib/rbac'

export type SectionMeta = {
  id: Section
  title: string
  url: string
  icon: React.ElementType
  group: 'Торги' | 'Контроль' | 'Деньги и выдача' | 'Система'
  /** Что будет в разделе — по ТЗ (docs/spec/tz.md). */
  description: string
  planned: string[]
}

export const SECTION_LIST: SectionMeta[] = [
  {
    id: 'dashboard',
    title: 'Обзор',
    url: '/',
    icon: LayoutDashboard,
    group: 'Торги',
    description: 'Ближайшая торговая сессия и ключевые показатели пилота.',
    planned: [],
  },
  {
    id: 'schedule',
    title: 'Расписание',
    url: '/schedule',
    icon: CalendarClock,
    group: 'Торги',
    description:
      'Пятничные сессии 09:00–18:00 по Ташкенту и лоты, назначенные на каждую.',
    planned: [
      'Календарь пятничных слотов',
      'Назначение проверенных лотов в слот',
      'Перенос лота в следующий слот, если очередь выкупа исчерпана',
    ],
  },
  {
    id: 'lots',
    title: 'Лоты',
    url: '/lots',
    icon: Gavel,
    group: 'Торги',
    description:
      'Карточки лотов: описание, стартовая цена, шаг, статус торгов.',
    planned: [
      'Создание и редактирование карточки до публикации',
      'Согласование стартовой цены и шага (нижняя граница 100 000 сум)',
      'После открытия торгов цена, шаг и описание заблокированы',
      'История ставок и итог — только просмотр, без правки',
    ],
  },
  {
    id: 'sellers',
    title: 'Заявки продавцов',
    url: '/sellers',
    icon: BadgeCheck,
    group: 'Торги',
    description:
      'Заявки «Стать продавцом». В пилоте принимаются без публикации лотов.',
    planned: [
      'Список заявок и тип профиля (физлицо / компания)',
      'Решение: допуск, ручная проверка, запрос данных, отказ — с причиной',
    ],
  },
  {
    id: 'inspection',
    title: 'Экспертиза',
    url: '/inspection',
    icon: ClipboardCheck,
    group: 'Контроль',
    description:
      'Приёмка товара, инвентарный номер, акт проверки и чек-лист телефона.',
    planned: [
      'Приёмка: фото, идентификатор, комплект, состояние',
      'Чек-лист: модель, память, корпус, экран, батарея, функции, ремонт',
      'Сверка IMEI / серийного номера (полный номер — с ограниченным доступом)',
      'Фото дефектов и краткая версия акта для карточки',
    ],
  },
  {
    id: 'risk',
    title: 'Риски и споры',
    url: '/risk',
    icon: ShieldAlert,
    group: 'Контроль',
    description: 'Сигналы антифрода, ручные разборы и споры по товару.',
    planned: [
      'Сигналы: связи аккаунтов, пары «продавец — участник», серии разгонов',
      'Ручной разбор с фиксацией решения и версии правила',
      'Лоты на разборе после сбоя, споры при расхождении с актом',
    ],
  },
  {
    id: 'restrictions',
    title: 'Ограничения',
    url: '/restrictions',
    icon: UserMinus,
    group: 'Контроль',
    description: 'Ограничения участия за невыкуп (50 календарных дней).',
    planned: [
      'Статус, дата и основание нарушения, срок, связанный заказ',
      'Снятие ограничения только с причиной и записью в аудит',
    ],
  },
  {
    id: 'finance',
    title: 'Платежи',
    url: '/finance',
    icon: Wallet,
    group: 'Деньги и выдача',
    description:
      'Взносы за допуск, предоплаты, остатки, возвраты и сверка с партнёром.',
    planned: [
      'Заказы по назначению: допуск, размещение, предоплата 30%, остаток',
      'Зависшие платежи и поздние оплаты на возврат',
      'Сверка с реестром платёжного партнёра',
    ],
  },
  {
    id: 'fulfillment',
    title: 'Выдача',
    url: '/fulfillment',
    icon: PackageCheck,
    group: 'Деньги и выдача',
    description: 'Выдача товара по одноразовому коду после полной оплаты.',
    planned: [
      'Проверка кода и статуса оплаты',
      'Сверка товара с актом; расхождение блокирует выдачу и открывает спор',
    ],
  },
  {
    id: 'staff',
    title: 'Сотрудники',
    url: '/staff',
    icon: UserCog,
    group: 'Система',
    description: 'Учётные записи сотрудников, роли и MFA.',
    planned: [
      'Создание сотрудника и назначение ролей',
      'Сброс MFA и блокировка доступа',
    ],
  },
  {
    id: 'audit',
    title: 'Журнал аудита',
    url: '/audit',
    icon: FileClock,
    group: 'Система',
    description: 'Кто, что и когда изменил или просмотрел.',
    planned: [
      'Изменения лотов, решения, баны, возвраты, выдачи',
      'Просмотр персональных данных и документов',
    ],
  },
]

export const SECTIONS_BY_ID = Object.fromEntries(
  SECTION_LIST.map((s) => [s.id, s])
) as Record<Section, SectionMeta>
