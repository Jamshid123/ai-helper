import { expect, test } from '@playwright/test'
import { openSection, staffSignIn } from './admin-helpers'

/**
 * Шаблоны товаров (решение 18.11.2026): поля карточки у категории; форма товара подстраивается под категорию —
 * без IMEI и батареи, если у категории нет блока устройства; обязательное поле не даёт сохранить.
 */
test('категория: поля карточки → форма товара под категорию, обязательное поле, без IMEI', async ({ page }) => {
  await staffSignIn(page)
  await openSection(page, 'Категории')
  await page.getByRole('button', { name: 'Добавить категорию' }).click()
  const cat = page.getByRole('dialog')
  await cat.getByLabel('Название на русском', { exact: true }).fill('E2E Часы')
  await cat.getByLabel('Название на узбекском', { exact: true }).fill('E2E Soatlar')
  await cat.getByLabel('Код').fill('e2e-watches')
  await cat.getByRole('button', { name: 'Добавить поле' }).click()
  await cat.getByLabel('Поле 1: название на русском').fill('Размер корпуса')
  await cat.getByLabel('Поле 1: название на узбекском').fill('Korpus oʻlchami')
  await cat.getByRole('switch', { name: 'Обязательное' }).click()
  await expect(cat.getByText('korpus_o_lchami')).toBeVisible() // код поля — из названия, латиницей
  await cat.getByRole('button', { name: 'Сохранить' }).click()
  await expect(cat).toBeHidden()
  await expect(page.getByRole('row').filter({ hasText: 'E2E Часы' })).toContainText('1')

  await openSection(page, 'Товары')
  await page.getByRole('button', { name: 'Добавить товар' }).click()
  const form = page.getByRole('dialog')
  await expect(form.getByLabel('IMEI / серийный')).toBeVisible() // по умолчанию — телефоны
  await form.getByRole('combobox', { name: 'Категория' }).click()
  await page.getByRole('option', { name: 'E2E Часы' }).click()
  await expect(form.getByLabel('IMEI / серийный')).toHaveCount(0)
  await expect(form.getByLabel('Батарея, %')).toHaveCount(0)
  await form.getByLabel('Название', { exact: true }).fill('E2E Apple Watch 9')
  const save = form.getByRole('button', { name: 'Сохранить' })
  await expect(save).toBeDisabled()
  await expect(form.getByText(/«Размер корпуса» — обязательное поле/)).toBeVisible()
  await form.getByLabel('Размер корпуса').fill('45 мм')
  await save.click()
  await expect(form).toBeHidden()
  await expect(page.getByRole('row').filter({ hasText: 'E2E Apple Watch 9' })).toBeVisible()
})
