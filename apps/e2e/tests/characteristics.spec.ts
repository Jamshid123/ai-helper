import { expect, test } from '@playwright/test'
import { fixtures, skipOnboarding } from './helpers'

test.beforeEach(({ page }) => skipOnboarding(page))

/**
 * Шаблоны товаров (решение 18.11.2026): у лота категории без блока устройства — «Характеристики» из полей категории,
 * без бейджа «Проверено экспертом», батареи и IMEI; поля «только для сотрудников» покупатель не видит.
 */
test('лот категории без блока устройства: «Характеристики», без бейджа, батареи и IMEI', async ({ page }) => {
  await page.goto(`/lot/${fixtures().laptopLotId}`)
  await expect(page.getByRole('heading', { name: 'E2E MacBook Air M1' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Характеристики' })).toBeVisible()
  await expect(page.getByText('Процессор')).toBeVisible()
  await expect(page.getByText('Apple M1')).toBeVisible()
  await expect(page.getByText('Скрытый склад')).toHaveCount(0)
  await expect(page.getByText('Поставщик')).toHaveCount(0)
  await expect(page.getByText('Проверено экспертом')).toHaveCount(0)
  await expect(page.getByText('IMEI')).toHaveCount(0)
  await expect(page.getByText('Батарея')).toHaveCount(0)
  // состояние со слов проверки — остаётся (без «акта эксперта»)
  await expect(page.getByRole('heading', { name: 'Состояние' })).toBeVisible()
  await expect(page.getByText('Корпус без вмятин')).toBeVisible()
})

test('телефон — как раньше: бейдж «Проверено экспертом» и IMEI в акте', async ({ page }) => {
  await page.goto(`/lot/${fixtures().liveLotId}`)
  await expect(page.getByText('Проверено экспертом')).toBeVisible()
  await expect(page.getByText('IMEI')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Характеристики' })).toHaveCount(0)
})
