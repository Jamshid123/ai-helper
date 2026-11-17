import { expect, test } from '@playwright/test'
import { fixtures } from '../helpers'
import { openSection, staffSignIn } from './admin-helpers'

/**
 * Выдача (решение 16.11.2026): победитель оплатил 10% → код и 24 часа. Сотрудник принимает остаток на месте
 * и выдаёт только по верному коду покупателя; неверный код отклоняется (и пишется в журнал).
 */
test('выдача: остаток на месте → неверный код отклонён → верный код, товар выдан', async ({ page }) => {
  await staffSignIn(page)
  await openSection(page, 'Выдача')
  const row = page.getByRole('row').filter({ hasText: 'E2E MacBook Air M2' })
  await expect(row.getByText('Ждёт выдачи')).toBeVisible()
  // пока остаток не принят, выдать нельзя
  await expect(row.getByRole('button', { name: 'Выдать по коду' })).toBeDisabled()

  await row.getByRole('button', { name: 'Остаток наличными' }).click()
  await expect(row.getByText('остаток оплачен на месте')).toBeVisible()

  await row.getByRole('button', { name: 'Выдать по коду' }).click()
  const dialog = page.getByRole('dialog', { name: 'Выдать товар' })
  const code = fixtures().admin.pickupCode
  const wrong = String((Number(code) + 1) % 1_000_000).padStart(6, '0')
  await dialog.getByLabel('Код выдачи').fill(wrong)
  await dialog.getByRole('button', { name: 'Выдать' }).click()
  await expect(page.getByText('Код не подходит — проверьте код у покупателя')).toBeVisible()
  await expect(dialog).toBeVisible()

  await dialog.getByLabel('Код выдачи').fill(code)
  await dialog.getByRole('button', { name: 'Выдать' }).click()
  await expect(dialog).toBeHidden()
  // выданный уходит из «В работе», виден во «Все»
  await page.getByRole('tab', { name: 'Все' }).click()
  await expect(page.getByRole('row').filter({ hasText: 'E2E MacBook Air M2' }).getByText('Выдан', { exact: true })).toBeVisible()
})
