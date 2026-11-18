import { expect, test } from '@playwright/test'
import {
  expectBottomNavUsable,
  expectDarkBackground,
  expectInViewport,
  expectNoHorizontalScroll,
  expectNotCovered,
  fixtures,
  signIn,
  skipOnboarding,
  useLocale,
} from './helpers'

/**
 * Маленький экран (iPhone SE), узбекский язык, тёмная тема — вместе: именно здесь чаще всего ломается вёрстка
 * (длинные узбекские строки, кнопки за краем экрана, перекрытия, светлые «дыры» в тёмной теме).
 */
test.beforeEach(async ({ page }) => {
  await skipOnboarding(page)
  await useLocale(page, 'uz')
})

test('гость: каталог и лот на узбекском — тёмный фон, без горизонтальной прокрутки, меню и кнопка не перекрыты', async ({
  page,
}) => {
  const { scheduledLotId } = fixtures()
  await page.goto('/')
  await expectDarkBackground(page)
  await expect(page.locator('nav.fixed').getByRole('link', { name: 'Katalog' })).toBeVisible()
  await expect(page.getByText('E2E Galaxy S23, 256 ГБ')).toBeVisible()
  await expectNoHorizontalScroll(page)

  await page.goto(`/lot/${scheduledLotId}`)
  await expect(page.getByRole('link', { name: 'Katalog' }).first()).toBeVisible()
  await expectNotCovered(page, 'Ishtirok etish')
  await expectInViewport(page, page.getByRole('button', { name: 'Ishtirok etish' }).last())
  await expectBottomNavUsable(page)
  await expectNoHorizontalScroll(page)
})

test('вход на узбекском: тексты, официальный адрес, без горизонтальной прокрутки', async ({ page }) => {
  await page.goto('/register')
  await expectDarkBackground(page)
  await expect(page.getByText('Rasmiy sayt — faqat auksiongo.uz')).toBeVisible()
  await expect(page.locator('button[type=submit]')).toHaveText('Kod olish')
  await expectNoHorizontalScroll(page)
})

test('допуск → комната → предложить цену → «Lotga» на маленьком экране', async ({ page }) => {
  const { liveLotId } = fixtures()
  await page.goto(`/lot/${liveLotId}`)
  await page.getByRole('button', { name: 'Ishtirok etish' }).last().click()
  await signIn(page)

  const sheet = page.getByRole('dialog')
  await expect(sheet).toContainText('Ishtirok badali')
  await expectNoHorizontalScroll(page)
  await sheet.locator('#agree').check()
  // кнопка оплаты внизу длинного окна: прокрутить и убедиться, что она целиком на экране и не перекрыта
  const pay = sheet.getByRole('button', { name: /Toʻlash/ })
  await pay.scrollIntoViewIfNeeded()
  await expectInViewport(page, pay)
  await expectNotCovered(page, /Toʻlash/)
  await pay.click()

  await expect(page).toHaveURL(new RegExp(`/lot/${liveLotId}/room`))
  await expect(page.getByText('Savdo jarayoni')).toBeVisible()
  await expectDarkBackground(page)
  await expectNoHorizontalScroll(page)
  const offer = page.getByRole('button', { name: /^Taklif qilish/ }).last()
  await expectInViewport(page, offer)
  await offer.click()
  await expect(page.getByText(/Sizning narxingiz eng yaxshisi/)).toBeVisible()

  await page.getByRole('link', { name: 'Lotga' }).or(page.getByRole('button', { name: 'Lotga' })).first().click()
  await expect(page).toHaveURL(new RegExp(`/lot/${liveLotId}$`))
  await expectNotCovered(page, 'Savdo xonasiga')
  await expectBottomNavUsable(page)
  await page.locator('nav.fixed').getByRole('link', { name: 'Profil' }).click()
  await expect(page).toHaveURL(/\/me$/)
  // «Мои лоты» на узбекском: лот — в «Идут сейчас», кнопка в комнату целиком на экране
  const block = page.locator('section[aria-labelledby=my-lots]')
  await expect(block.getByRole('heading', { name: 'Lotlarim' })).toBeVisible()
  await expect(block.getByRole('heading', { name: 'Hozir bormoqda' })).toBeVisible()
  const toRoom = block.getByRole('link', { name: 'Savdo xonasiga' })
  await expectInViewport(page, toRoom)
  await expectNoHorizontalScroll(page)
})
