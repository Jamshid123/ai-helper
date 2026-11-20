import { expect, type Page } from '@playwright/test'
import { fixtures } from '../helpers'

/** Вход сотрудника (владелец, создаётся при старте API — scripts/start-api.sh). */
export async function staffSignIn(page: Page, password = fixtures().admin.password) {
  await page.goto('/sign-in')
  await page.getByLabel('Телефон').fill(fixtures().admin.phone)
  await page.getByLabel('Пароль').fill(password)
  await page.getByRole('button', { name: 'Войти' }).click()
}

/** Вкладки раздела (ТЗ 20.11.2026: 7 разделов меню, внутри — вкладки). */
export const sectionTabs = (page: Page) => page.getByRole('navigation', { name: 'Вкладки раздела' })

/** Переход в раздел через боковое меню и, если нужно, во вкладку — так, как это делает оператор. */
export async function openSection(page: Page, area: string, tab?: string) {
  await page.getByRole('link', { name: area, exact: true }).first().click()
  await expect(page.getByRole('heading', { name: area, level: 1 })).toBeVisible()
  if (tab) {
    await sectionTabs(page).getByRole('link', { name: tab, exact: true }).click()
    await expect(sectionTabs(page).getByRole('link', { name: tab, exact: true })).toHaveAttribute('aria-current', 'page')
  }
}
