import { expect, test } from '@playwright/test'
import { openSection, staffSignIn } from './admin-helpers'

test('участники: поиск по телефону и ограничение участия с обязательной причиной', async ({ page }) => {
  await staffSignIn(page)
  await openSection(page, 'Пользователи')
  await page.getByLabel('Поиск участника').fill('901110003')
  const row = page.getByRole('row').filter({ hasText: 'Нарушитель Тестов' })
  await expect(row).toBeVisible()
  await row.click()

  await page.getByRole('button', { name: 'Ограничить участие' }).click()
  const dialog = page.getByRole('dialog', { name: 'Ограничить участие' })
  const confirm = dialog.getByRole('button', { name: 'Ограничить' })
  // без причины решение не принять (требование ТЗ к админке)
  await expect(confirm).toBeDisabled()
  await dialog.getByLabel('Срок, дней').fill('7')
  await dialog.getByLabel('Причина').fill('E2E: не выкупил лот')
  await confirm.click()
  await expect(dialog).toBeHidden()
  await expect(page.getByText(/Причина:\s*E2E: не выкупил лот/).first()).toBeVisible()
})
