import { expect, test } from '@playwright/test'
import { openSection, staffSignIn } from './admin-helpers'

test('без входа админка отправляет на страницу входа', async ({ page }) => {
  await page.goto('/lots')
  await expect(page).toHaveURL(/\/sign-in/)
  await expect(page.getByRole('button', { name: 'Войти' })).toBeVisible()
})

test('неверный пароль — понятная ошибка, в админку не пускает', async ({ page }) => {
  await staffSignIn(page, 'wrong password 000')
  await expect(page.getByText('Неверный телефон или пароль.')).toBeVisible()
  await expect(page).toHaveURL(/\/sign-in/)
})

test('владелец входит и видит все разделы; лоты из базы в списке', async ({ page }) => {
  await staffSignIn(page)
  await expect(page.getByRole('heading', { name: 'Обзор', level: 1 })).toBeVisible()
  for (const s of ['Аукционы', 'Каталог', 'Пользователи', 'Финансы', 'Контроль', 'Настройки']) {
    await expect(page.getByRole('link', { name: s, exact: true }).first()).toBeVisible()
  }
  // раздел открывает первую вкладку — «Все лоты»
  await openSection(page, 'Аукционы')
  await expect(page).toHaveURL(/\/lots$/)
  await expect(page.getByText('E2E iPhone 13, 128 ГБ')).toBeVisible()
  await expect(page.getByText('E2E Galaxy S23, 256 ГБ')).toBeVisible()
})
