import { expect, type Page } from '@playwright/test'
import { fixtures } from '../helpers'

/** Вход сотрудника (владелец, создаётся при старте API — scripts/start-api.sh). */
export async function staffSignIn(page: Page, password = fixtures().admin.password) {
  await page.goto('/sign-in')
  await page.getByLabel('Телефон').fill(fixtures().admin.phone)
  await page.getByLabel('Пароль').fill(password)
  await page.getByRole('button', { name: 'Войти' }).click()
}

/** Переход в раздел через боковое меню — так, как это делает оператор. */
export async function openSection(page: Page, title: string) {
  await page.getByRole('link', { name: title, exact: true }).first().click()
  await expect(page.getByRole('heading', { name: title, level: 1 })).toBeVisible()
}
