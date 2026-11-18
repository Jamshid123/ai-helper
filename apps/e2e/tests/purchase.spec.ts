import { expect, test } from '@playwright/test'
import { fixtures, signIn, skipOnboarding } from './helpers'

test.beforeEach(({ page }) => skipOnboarding(page))

// у победителя одно обязательство на весь прогон — сценарий идёт в одном проекте (телефон)
test('победитель: баннер «оплатите 10%» → оплата → код выдачи и остаток', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'одно обязательство на прогон — проверяем на телефоне')
  const { winnerPhone, soldLotId } = fixtures()
  await page.goto('/register')
  await signIn(page, { phone: winnerPhone })
  await page.goto(`/lot/${soldLotId}`)
  await expect(page.getByText('300 000').first()).toBeVisible() // 10% от 3 000 000
  await page.getByRole('button', { name: /Оплатить\s*300 000/ }).first().click()
  await expect(page.getByText('Код выдачи')).toBeVisible()
  // код — по нажатию (решение 18.11.2026)
  await page.getByRole('button', { name: 'Показать код' }).click()
  await expect(page.getByText(/^\d{6}$/)).toBeVisible()
  await expect(page.getByText('2 700 000').first()).toBeVisible() // остаток
})
