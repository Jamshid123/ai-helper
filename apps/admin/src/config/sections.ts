import {
  BadgeCheck,
  CalendarClock,
  ClipboardCheck,
  FileClock,
  Gavel,
  LayoutDashboard,
  Package,
  PackageCheck,
  ShieldAlert,
  ShieldCheck,
  Tags,
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
    description: 'Ближайшая торговая сессия и ключевые показатели пилота.',
    planned: [],
  },
  {
    id: 'schedule',
    title: 'Расписание',
    url: '/schedule',
    icon: CalendarClock,
    description:
      'Торги по дням: начало в любой день и время, продолжительность, минимум и максимум участников, ожидание следующего предложения.',
    planned: [],
  },
  {
    id: 'categories',
    title: 'Категории',
    url: '/categories',
    icon: Tags,
    description:
      'Категории каталога: названия на русском и узбекском, включение и порядок. Выключенная категория и её лоты не видны покупателям.',
    planned: [],
  },
  {
    id: 'products',
    title: 'Товары',
    url: '/products',
    icon: Package,
    description:
      'Товары площадки: карточка, акт проверки, себестоимость. Из товара создаётся лот.',
    planned: [],
  },
  {
    id: 'lots',
    title: 'Лоты',
    url: '/lots',
    icon: Gavel,
    description:
      'Лоты из товаров: черновик → публикация. До открытия торгов можно править и отменить (участникам — возврат), после открытия лот не меняется.',
    planned: [
      'Создание и редактирование карточки до публикации',
      'Согласование стартовой цены и шага (нижняя граница 100 000 сум)',
      'После открытия торгов цена, шаг и описание заблокированы',
      'История ценовых предложений и итог — только просмотр, без правки',
    ],
  },
  {
    id: 'sellers',
    title: 'Заявки продавцов',
    url: '/sellers',
    icon: BadgeCheck,
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
    description: 'Сигналы антифрода, ручные разборы и споры по товару.',
    planned: [
      'Сигналы: связи аккаунтов, пары «продавец — участник», серии разгонов',
      'Ручной разбор с фиксацией решения и версии правила',
      'Лоты на разборе после сбоя, споры при расхождении с актом',
    ],
  },
  {
    id: 'participants',
    title: 'Участники',
    url: '/participants',
    icon: UserMinus,
    description:
      'Поиск участника, его допуски и ограничения. Ограничить, снять ограничение или отменить допуск до начала — только с причиной.',
    planned: [],
  },
  {
    id: 'finance',
    title: 'Решения по 10%',
    url: '/finance',
    icon: Wallet,
    description:
      'Победитель оплатил 10%, но не забрал товар за 24 часа: вернуть или удержать предоплату — только с причиной, решение пишется в журнал.',
    planned: [
      'Заказы по назначению: допуск, предоплата 10%, остаток',
      'Зависшие платежи и поздние оплаты на возврат',
      'Сверка с реестром платёжного партнёра',
    ],
  },
  {
    id: 'fulfillment',
    title: 'Выдача',
    url: '/fulfillment',
    icon: PackageCheck,
    description:
      'Победитель оплатил 10% — у него код и 24 часа. Примите остаток (если не оплачен на сайте) и выдайте товар по коду.',
    planned: [
      'Сверка товара с актом; расхождение блокирует выдачу и открывает спор',
    ],
  },
  {
    id: 'staff',
    title: 'Сотрудники',
    url: '/staff',
    icon: UserCog,
    description:
      'Сотрудники админки: вход по телефону и паролю, доступ — по роли. Пароль виден только при вводе: передайте его сотруднику сразу.',
    planned: [],
  },
  {
    id: 'roles',
    title: 'Роли',
    url: '/roles',
    icon: ShieldCheck,
    description:
      'Роли сотрудников и их права по каждому разделу: нет доступа, только просмотр или изменение. Настраивает владелец.',
    planned: [],
  },
  {
    id: 'audit',
    title: 'Журнал аудита',
    url: '/audit',
    icon: FileClock,
    description:
      'Кто, что и когда изменил: лоты, категории, товары, ограничения, возвраты, входы сотрудников.',
    planned: [
      'Изменения лотов, решения, баны, возвраты, выдачи',
      'Просмотр персональных данных и документов',
    ],
  },
]

export const SECTIONS_BY_ID = Object.fromEntries(
  SECTION_LIST.map((s) => [s.id, s])
) as Record<Section, SectionMeta>
