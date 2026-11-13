import { createContext, useContext, useMemo, useState } from 'react'
import { type Locale } from '@auksion/shared'
import { telegramLanguage } from './telegram'

/**
 * Тексты интерфейса. Ключи ru и uz обязаны совпадать (проверяется тестом).
 * Узбекский — латиница. Тексты uz нужно вычитать носителю языка до запуска.
 */
export const dict = {
  ru: {
    'howto.title': 'Как это работает',
    'howto.hide': 'Скрыть',
    'howto.1': 'Выберите лот и получите допуск — взнос за участие в одном лоте',
    'howto.2': 'В пятницу с 09:00 до 18:00 предлагайте цену в комнате торгов',
    'howto.3': 'Победили — внесите 30% за 15 минут, остаток и получение товара — за 24 часа',
    'lot.refund': 'Возврат взноса',
    'lot.refund.text':
      'Возвращаем, если до открытия торгов описание лота существенно исправлено или если оплата пришла после закрытия торгов',
    'lot.pickup': 'Пункт выдачи',
    'lot.pickup.text': 'Ташкент — адрес и график сообщим до начала торгов',
    'room.confirm': 'Подтвердить',
    'room.online': 'в комнате',
    'catalog.demoLive': 'Идут демо-торги',
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
    'room.leader': 'Лучшая цена',
    'room.min': 'мин',
    'room.yourOffer': 'Ваше предложение',
    'room.getAdmission': 'Получить допуск',
    'room.back': 'К лоту',
    'room.leaderIs': 'Лидирует',
    'catalog.toRoom': 'В комнату торгов',
    'catalog.details': 'Подробнее',
    'room.you': 'Вы',
    'room.minBid': 'Следующая цена — от',
    'room.inRoom': 'Сейчас в комнате',
    'room.history': 'Ход торгов',
    'room.noBids': 'Предложений пока нет. Первое — от стартовой цены.',
    'room.bid': 'Предложить',
    'room.youLead': 'Ваша цена — лучшая. Ждём предложений других участников',
    'room.outbid': 'Вашу цену перебили — предложите больше',
    'room.closed': 'Торги по лоту завершены',
    'room.notAdmitted': 'Чтобы предлагать цену, получите допуск к этому лоту',
    'me.title': 'Профиль',
    'me.language': 'Язык',
    'me.admissions': 'Мои допуски',
    'me.none': 'Пока нет',
    'nav.catalog': 'Каталог',
    'nav.me': 'Профиль',
    'time.d': 'д',
  },
  uz: {
    'howto.title': 'Bu qanday ishlaydi',
    'howto.hide': 'Yashirish',
    'howto.1': 'Lotni tanlang va ruxsat oling — bitta lotda ishtirok badali',
    'howto.2': 'Juma kuni 09:00 dan 18:00 gacha savdo xonasida narx taklif qiling',
    'howto.3': 'Yutdingizmi — 15 daqiqada 30% toʻlang, qolganini toʻlash va tovarni olish — 24 soat ichida',
    'lot.refund': 'Badalni qaytarish',
    'lot.refund.text':
      'Savdo ochilishidan oldin lot tavsifi jiddiy tuzatilsa yoki toʻlov savdo yopilgandan keyin kelsa, qaytaramiz',
    'lot.pickup': 'Topshirish punkti',
    'lot.pickup.text': 'Toshkent — manzil va ish vaqtini savdodan oldin xabar qilamiz',
    'room.confirm': 'Tasdiqlash',
    'room.online': 'xonada',
    'catalog.demoLive': 'Demo-savdo ketmoqda',
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
    'room.leader': 'Eng yaxshi narx',
    'room.min': 'min',
    'room.yourOffer': 'Sizning taklifingiz',
    'room.getAdmission': 'Ruxsat olish',
    'room.back': 'Lotga',
    'room.leaderIs': 'Yetakchi',
    'catalog.toRoom': 'Savdo xonasiga',
    'catalog.details': 'Batafsil',
    'room.you': 'Siz',
    'room.minBid': 'Keyingi narx — dan',
    'room.inRoom': 'Hozir xonada',
    'room.history': 'Savdo jarayoni',
    'room.noBids': 'Hali takliflar yoʻq. Birinchisi — boshlangʻich narxdan.',
    'room.bid': 'Taklif qilish',
    'room.youLead': 'Sizning narxingiz eng yaxshisi. Boshqalarning takliflarini kutamiz',
    'room.outbid': 'Narxingizdan oshib ketishdi — koʻproq taklif qiling',
    'room.closed': 'Lot boʻyicha savdo yakunlandi',
    'room.notAdmitted': 'Narx taklif qilish uchun ushbu lotga ruxsat oling',
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

type Ctx = {
  locale: Locale
  setLocale: (l: Locale) => void
  t: (k: TKey) => string
}
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
