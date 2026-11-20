import { expect, test } from '@playwright/test'
import { staffSignIn } from './admin-helpers'

/**
 * «Обзор» (ТЗ 20.11.2026): реальные торги с таймером вместо расчётного слота, «Требуют внимания»
 * со ссылками на списки, показатели за период по Ташкенту (период — в адресе).
 */
test('обзор: идущие торги, задачи ведут в списки, период показателей в адресе', async ({ page }) => {
  await staffSignIn(page)
  await expect(page.getByRole('heading', { name: 'Обзор', level: 1 })).toBeVisible()

  // идущий лот из базы — с таймером до окончания
  const live = page.getByRole('listitem').filter({ hasText: 'E2E iPhone 13, 128 ГБ' })
  await expect(live.getByText(/до окончания \d/)).toBeVisible()

  // показатели: «всего» и «за период»
  const metrics = page.getByRole('region', { name: 'Показатели' })
  await expect(metrics.getByText('Покупатели — всего')).toBeVisible()
  await expect(metrics.getByText('за 7 дней').first()).toBeVisible()
  await page.getByRole('group', { name: 'Период показателей' }).getByRole('button', { name: '30 дней' }).click()
  await expect(page).toHaveURL(/\?period=30d$/)
  await expect(metrics.getByText('за 30 дней').first()).toBeVisible()
  await page.reload()
  await expect(page.getByRole('button', { name: '30 дней' })).toHaveAttribute('aria-pressed', 'true')

  // счётчик ведёт в нужную вкладку
  await page.getByRole('link', { name: /Ждём оплату 10% от победителя/ }).click()
  await expect(page).toHaveURL(/\/fulfillment$/)
  await expect(page.getByRole('heading', { name: 'Аукционы', level: 1 })).toBeVisible()
})
