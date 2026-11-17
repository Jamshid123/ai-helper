import { readFileSync } from 'node:fs'
import path from 'node:path'
import { expect, type Page } from '@playwright/test'

export type Fixtures = {
  liveLotId: string
  scheduledLotId: string
  soldLotId: string
  winnerPhone: string
  /** сотрудник-владелец и код выдачи для тестов админки */
  admin: { phone: string; password: string; pickupCode: string }
}

/** id тестовых лотов и телефон победителя (пишет scripts/seed.cjs при старте API). */
export function fixtures(): Fixtures {
  return JSON.parse(readFileSync(path.join(__dirname, '../.fixtures.json'), 'utf8'))
}

/** Онбординг показывается один раз на устройстве — в тестах считаем его пройденным (кроме теста онбординга). */
export async function skipOnboarding(page: Page) {
  await page.addInitScript(() => localStorage.setItem('auksion.onboarding.v2', '1'))
}

/** Язык интерфейса до первой загрузки (сайт хранит выбор в localStorage). */
export async function useLocale(page: Page, locale: 'ru' | 'uz') {
  await page.addInitScript((l) => localStorage.setItem('auksion.locale', l), locale)
}

/** Новый номер для каждого теста: покупатели не мешают друг другу. */
export const randomPhone = () => '90' + String(Math.floor(Math.random() * 1e7)).padStart(7, '0')

/**
 * Вход по SMS на тестовом стенде: код показан на экране («Тестовый запуск: … ваш код»).
 * Новый номер → шаг «Как вас зовут». После входа сайт сам возвращает туда, откуда пришли.
 */
export async function signIn(page: Page, opts: { phone?: string; firstName?: string } = {}) {
  const phone = opts.phone ?? randomPhone()
  await page.locator('input[inputmode=tel]').fill(phone.replace(/^\+998/, ''))
  await page.locator('button[type=submit]').click()
  const demo = page.getByText(/ваш код|kodingiz/)
  await expect(demo).toBeVisible()
  const code = (await demo.locator('..').innerText()).match(/(\d{6})/)![1]
  // 6 цифр — вход без нажатия кнопки
  await page.locator('input[inputmode=numeric]').pressSequentially(code)
  if (opts.firstName !== undefined || !opts.phone) {
    const first = page.getByLabel(/^(Имя|Ism)$/)
    await expect(first).toBeVisible()
    await first.fill(opts.firstName ?? 'Тест')
    await page.locator('button[type=submit]').click()
  }
  // дождаться конца входа (сайт сам уходит с /register): иначе следующий переход опередит сессию
  await expect(page).not.toHaveURL(/\/register/)
  return phone
}

/** Нижнее меню телефона не закрыто ничем (баг 17.11.2026: кнопка лота лежала поверх меню). */
export async function expectBottomNavUsable(page: Page) {
  const nav = page.locator('nav.fixed')
  await expect(nav).toBeVisible()
  const box = (await nav.boundingBox())!
  for (const x of [box.x + box.width * 0.25, box.x + box.width * 0.75]) {
    const onNav = await page.evaluate(([px, py]) => !!document.elementFromPoint(px, py)?.closest('nav'), [x, box.y + box.height / 2])
    expect(onNav, 'нижнее меню закрыто другим элементом').toBe(true)
  }
}

/** Кнопка видна и не перекрыта ничем (меню, баннером): касание попадёт именно в неё. */
export async function expectNotCovered(page: Page, name: string | RegExp) {
  const btn = page.getByRole('button', { name }).last()
  await expect(btn).toBeVisible()
  const box = (await btn.boundingBox())!
  const handle = await btn.elementHandle()
  const onBtn = await page.evaluate(
    ([el, x, y]) => {
      const hit = document.elementFromPoint(x as number, y as number)
      return !!hit && (el as Element).contains(hit)
    },
    [handle, box.x + box.width / 2, box.y + box.height / 2] as const
  )
  expect(onBtn, `кнопка «${String(name)}» перекрыта другим элементом`).toBe(true)
}

/** Нет горизонтальной прокрутки страницы (маленький экран, длинные узбекские строки). */
export async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(overflow, 'страница шире экрана — появляется горизонтальная прокрутка').toBeLessThanOrEqual(1)
}

/** Элемент целиком в видимой области экрана (не уехал за край на маленьком экране). */
export async function expectInViewport(page: Page, locator: import('@playwright/test').Locator) {
  const box = (await locator.boundingBox())!
  const vp = page.viewportSize()!
  expect(box.x, 'элемент уехал за левый край').toBeGreaterThanOrEqual(0)
  expect(box.x + box.width, 'элемент уехал за правый край').toBeLessThanOrEqual(vp.width + 1)
  expect(box.y + box.height, 'элемент ниже экрана').toBeLessThanOrEqual(vp.height + 1)
}

/** Тёмная тема действительно включилась: фон страницы тёмный (яркость < 30%). */
export async function expectDarkBackground(page: Page) {
  const lum = await page.evaluate(() => {
    const m = getComputedStyle(document.body).backgroundColor.match(/\d+(\.\d+)?/g)!.map(Number)
    return (0.2126 * m[0] + 0.7152 * m[1] + 0.0722 * m[2]) / 255
  })
  expect(lum, 'фон не тёмный в тёмной теме').toBeLessThan(0.3)
}
