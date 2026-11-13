import { createContext, useContext, useMemo, useState } from 'react'
import { type Locale } from '@auksion/shared'
import { telegramLanguage } from './telegram'

/**
 * Тексты интерфейса. Ключи ru и uz обязаны совпадать (проверяется тестом).
 * Узбекский — латиница. Тексты uz нужно вычитать носителю языка до запуска.
 */
export const dict = {
  ru: {
    'app.demo': 'Демо-стенд: данные тестовые, оплата не списывается',
    'app.openInTelegram': 'Откройте приложение в Telegram',
    'catalog.nextSession': 'Торги в пятницу',
    'catalog.liveNow': 'Торги идут',
    'catalog.until': 'до',
    'catalog.category.phones': 'Телефоны',
    'catalog.category.travel': 'Путешествия',
    'catalog.soon': 'скоро',
    'filter.all': 'Все',
    'filter.new': 'Новые',
    'filter.used': 'Б/у, рабочие',
    'lot.start': 'Старт',
    'lot.current': 'Текущая цена',
    'lot.step': 'Шаг',
    'lot.admitted': 'Допущено',
    'lot.seller': 'Продавец',
    'lot.sellerPlatform': 'Площадка',
    'lot.verified': 'Проверено экспертом',
    'lot.condition.new': 'Новый',
    'lot.condition.used': 'Б/у, рабочий',
    'lot.inspection': 'Акт проверки',
    'lot.kit': 'Комплектация',
    'lot.battery': 'Аккумулятор',
    'lot.defects': 'Дефекты',
    'lot.noDefects': 'Не обнаружены',
    'lot.terms': 'Условия',
    'lot.terms.text':
      'Победитель вносит 30% за 15 минут после торгов, остаток — и получение товара в пункте выдачи — в течение 24 часов. Невыкуп ограничивает участие в торгах на 50 дней.',
    'lot.fee': 'Взнос за участие',
    'lot.feeNote': 'Взнос за один лот, не входит в цену товара',
    'lot.opensIn': 'Откроется через',
    'lot.endsIn': 'До конца',
    'lot.participate': 'Участвовать',
    'lot.toRoom': 'В комнату торгов',
    'lot.admittedBadge': 'Вы допущены',
    'admission.title': 'Допуск к лоту',
    'admission.pay': 'Оплатить',
    'admission.cancel': 'Отмена',
    'admission.agree': 'Я принимаю правила торгов и обязательства победителя',
    'room.leader': 'Лидер',
    'room.min': 'мин',
    'room.you': 'Вы',
    'room.minBid': 'Минимальная ставка',
    'room.inRoom': 'Сейчас в комнате',
    'room.history': 'История ставок',
    'room.noBids': 'Ставок пока нет. Первая ставка — от стартовой цены.',
    'room.bid': 'Поставить',
    'room.youLead': 'Вы лидируете',
    'room.outbid': 'Вашу ставку перебили',
    'room.closed': 'Торги по лоту завершены',
    'room.notAdmitted': 'Чтобы ставить, оплатите допуск к лоту',
    'me.title': 'Профиль',
    'me.language': 'Язык',
    'me.admissions': 'Мои допуски',
    'me.none': 'Пока нет',
    'nav.catalog': 'Каталог',
    'nav.me': 'Профиль',
    'time.d': 'д',
  },
  uz: {
    'app.demo': 'Demo: maʼlumotlar sinov uchun, toʻlov yechilmaydi',
    'app.openInTelegram': 'Ilovani Telegramda oching',
    'catalog.nextSession': 'Savdo juma kuni',
    'catalog.liveNow': 'Savdo ketmoqda',
    'catalog.until': 'gacha',
    'catalog.category.phones': 'Telefonlar',
    'catalog.category.travel': 'Sayohatlar',
    'catalog.soon': 'tez orada',
    'filter.all': 'Barchasi',
    'filter.new': 'Yangi',
    'filter.used': 'Ishlatilgan, soz',
    'lot.start': 'Boshlangʻich',
    'lot.current': 'Joriy narx',
    'lot.step': 'Qadam',
    'lot.admitted': 'Ruxsat olgan',
    'lot.seller': 'Sotuvchi',
    'lot.sellerPlatform': 'Platforma',
    'lot.verified': 'Ekspert tekshirgan',
    'lot.condition.new': 'Yangi',
    'lot.condition.used': 'Ishlatilgan, soz',
    'lot.inspection': 'Tekshiruv dalolatnomasi',
    'lot.kit': 'Toʻplam',
    'lot.battery': 'Batareya',
    'lot.defects': 'Nuqsonlar',
    'lot.noDefects': 'Aniqlanmadi',
    'lot.terms': 'Shartlar',
    'lot.terms.text':
      'Gʻolib savdodan keyin 15 daqiqa ichida 30% toʻlaydi, qolgan qismini toʻlash va tovarni olish — 24 soat ichida. Sotib olmaslik savdolarda ishtirokni 50 kunga cheklaydi.',
    'lot.fee': 'Ishtirok badali',
    'lot.feeNote': 'Bitta lot uchun badal, tovar narxiga kirmaydi',
    'lot.opensIn': 'Ochilishiga',
    'lot.endsIn': 'Tugashiga',
    'lot.participate': 'Ishtirok etish',
    'lot.toRoom': 'Savdo xonasiga',
    'lot.admittedBadge': 'Sizga ruxsat berildi',
    'admission.title': 'Lotga ruxsat',
    'admission.pay': 'Toʻlash',
    'admission.cancel': 'Bekor qilish',
    'admission.agree': 'Savdo qoidalari va gʻolib majburiyatlarini qabul qilaman',
    'room.leader': 'Yetakchi',
    'room.min': 'min',
    'room.you': 'Siz',
    'room.minBid': 'Eng kam stavka',
    'room.inRoom': 'Hozir xonada',
    'room.history': 'Stavkalar tarixi',
    'room.noBids': 'Hali stavka yoʻq. Birinchi stavka — boshlangʻich narxdan.',
    'room.bid': 'Stavka qoʻyish',
    'room.youLead': 'Siz yetakchisiz',
    'room.outbid': 'Stavkangizdan oshib ketishdi',
    'room.closed': 'Lot boʻyicha savdo yakunlandi',
    'room.notAdmitted': 'Stavka qoʻyish uchun lotga ruxsat uchun toʻlang',
    'me.title': 'Profil',
    'me.language': 'Til',
    'me.admissions': 'Ruxsatlarim',
    'me.none': 'Hozircha yoʻq',
    'nav.catalog': 'Katalog',
    'nav.me': 'Profil',
    'time.d': 'k',
  },
} as const

export type TKey = keyof (typeof dict)['ru']

type Ctx = { locale: Locale; setLocale: (l: Locale) => void; t: (k: TKey) => string }
const I18nContext = createContext<Ctx | null>(null)

const STORAGE_KEY = 'auksion.locale'

function initialLocale(): Locale {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved === 'ru' || saved === 'uz') return saved
  } catch {
    // localStorage недоступен — используем язык Telegram
  }
  return telegramLanguage() === 'uz' ? 'uz' : 'ru'
}

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale)
  const value = useMemo<Ctx>(
    () => ({
      locale,
      setLocale: (l) => {
        setLocaleState(l)
        try {
          localStorage.setItem(STORAGE_KEY, l)
        } catch {
          // не критично
        }
      },
      t: (k) => dict[locale][k],
    }),
    [locale]
  )
  return <I18nContext value={value}>{children}</I18nContext>
}

export function useI18n(): Ctx {
  const ctx = useContext(I18nContext)
  if (!ctx) throw new Error('useI18n outside I18nProvider')
  return ctx
}
