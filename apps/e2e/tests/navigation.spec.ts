import { expect, test } from '@playwright/test'
import { expectBottomNavUsable, expectNotCovered, fixtures, signIn, skipOnboarding } from './helpers'

test.beforeEach(({ page }) => skipOnboarding(page))

test('гость: каталог → лот → назад в каталог и в профиль (меню не закрыто кнопкой лота)', async ({ page, isMobile }) => {
  const { scheduledLotId } = fixtures()
  await page.goto('/')
  await expect(page.getByText('E2E Galaxy S23, 256 ГБ')).toBeVisible()
  await page.goto(`/lot/${scheduledLotId}`)
  await expect(page.getByRole('heading', { name: 'E2E Galaxy S23, 256 ГБ' })).toBeVisible()
  await expectNotCovered(page, 'Участвовать')
  if (isMobile) {
    await expectBottomNavUsable(page)
    await page.locator('nav.fixed').getByRole('link', { name: 'Профиль' }).click()
    await expect(page).toHaveURL(/\/(me|register)/)
    await page.goBack()
    await page.getByRole('link', { name: 'Каталог' }).first().click()
  } else {
    await page.locator('header').getByRole('link', { name: 'Каталог' }).click()
  }
  await expect(page).toHaveURL(/\/$/)
})

test('гость: «Участвовать» ведёт на вход, после входа — обратно к лоту с окном допуска', async ({ page }) => {
  const { scheduledLotId } = fixtures()
  await page.goto(`/lot/${scheduledLotId}`)
  await page.getByRole('button', { name: 'Участвовать' }).last().click()
  await expect(page).toHaveURL(/\/register/)
  await signIn(page)
  await expect(page).toHaveURL(new RegExp(`/lot/${scheduledLotId}`))
  await expect(page.getByRole('dialog')).toBeVisible()
  await expect(page.getByRole('dialog')).toContainText('Взнос за участие')
})

test('экран входа: официальный адрес — auksiongo.uz', async ({ page }) => {
  await page.goto('/register')
  await expect(page.getByText('Официальный сайт — только auksiongo.uz')).toBeVisible()
})
