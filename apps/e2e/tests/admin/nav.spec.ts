import { expect, test } from '@playwright/test'
import { openSection, sectionTabs, staffSignIn } from './admin-helpers'

/**
 * Навигация админки (ТЗ 20.11.2026): 7 разделов, внутри вкладки; адреса страниц прежние —
 * прямые и старые ссылки, обновление страницы и «назад/вперёд» открывают ту же вкладку.
 */
test('старая ссылка открывает вкладку раздела; обновление и «назад» сохраняют её', async ({ page }) => {
  await staffSignIn(page)
  await expect(page.getByRole('heading', { name: 'Обзор', level: 1 })).toBeVisible()

  await page.goto('/fulfillment')
  await expect(page.getByRole('heading', { name: 'Аукционы', level: 1 })).toBeVisible()
  const tab = (name: string) => sectionTabs(page).getByRole('link', { name, exact: true })
  await expect(tab('Выдача')).toHaveAttribute('aria-current', 'page')
  await expect(sectionTabs(page).getByRole('link')).toHaveText(['Все лоты', 'Расписание', 'Результаты', 'Выдача'])
  // «Решение по 10%» переехало в Финансы — в Выдаче только «В работе» и «Все»
  await expect(page.getByRole('tab', { name: 'Решение по 10%' })).toHaveCount(0)

  await page.reload()
  await expect(tab('Выдача')).toHaveAttribute('aria-current', 'page')

  await tab('Результаты').click()
  await expect(page).toHaveURL(/\/results$/)
  await expect(page.getByRole('columnheader', { name: 'Итоговая цена' })).toBeVisible()
  await page.goBack()
  await expect(page).toHaveURL(/\/fulfillment$/)
  await expect(tab('Выдача')).toHaveAttribute('aria-current', 'page')
})

test('фильтр лотов по статусу живёт в адресе', async ({ page }) => {
  await staffSignIn(page)
  await openSection(page, 'Аукционы', 'Все лоты')
  await expect(page.getByText('E2E iPhone 13, 128 ГБ')).toBeVisible()
  const filters = page.getByRole('group', { name: 'Статус лота' })
  await filters.getByRole('button', { name: 'Отменённые' }).click()
  await expect(page).toHaveURL(/\/lots\?status=cancelled$/)
  await page.reload()
  await expect(filters.getByRole('button', { name: 'Отменённые' })).toHaveAttribute('aria-pressed', 'true')
  await expect(filters.getByRole('button', { name: 'Все' })).toHaveAttribute('aria-pressed', 'false')
  await expect(page.getByText('E2E iPhone 13, 128 ГБ')).toBeHidden()
  await page.goBack()
  await expect(page).toHaveURL(/\/lots$/)
  await expect(page.getByText('E2E iPhone 13, 128 ГБ')).toBeVisible()
})

test('поиск по разделам находит страницу по старому названию', async ({ page }) => {
  await staffSignIn(page)
  await expect(page.getByRole('heading', { name: 'Обзор', level: 1 })).toBeVisible()
  await page.getByRole('button', { name: 'Поиск по разделам' }).click()
  await page.getByPlaceholder('Раздел или команда…').fill('Платежи')
  await page.getByRole('option', { name: /Решения по 10%/ }).click()
  await expect(page).toHaveURL(/\/finance$/)
  await expect(page.getByRole('heading', { name: 'Финансы', level: 1 })).toBeVisible()
  await expect(sectionTabs(page).getByRole('link', { name: 'Решения по 10%' })).toHaveAttribute('aria-current', 'page')
})
