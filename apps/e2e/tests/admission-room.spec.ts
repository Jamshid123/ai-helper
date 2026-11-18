import { expect, test } from '@playwright/test'
import { expectBottomNavUsable, expectNotCovered, fixtures, signIn, skipOnboarding } from './helpers'

test.beforeEach(({ page }) => skipOnboarding(page))

test('допуск к живым торгам → комната → предложить цену → «К лоту» → меню доступно', async ({ page, isMobile }) => {
  const { liveLotId } = fixtures()
  await page.goto(`/lot/${liveLotId}`)
  await page.getByRole('button', { name: 'Участвовать' }).last().click()
  await signIn(page)
  const sheet = page.getByRole('dialog')
  await expect(sheet).toBeVisible()
  // допуск бесплатный (решение 18.11.2026): видно «Участие бесплатно» и обязательства победителя, ни суммы, ни оплаты
  await expect(sheet).toContainText('Участие бесплатно')
  await expect(sheet).toContainText('оплатите 10% своей цены за 15 минут')
  await expect(sheet).toContainText('ограничат на 7 дней')
  await expect(sheet).not.toContainText(/Взнос|12 000|Click|Payme/)
  const pay = sheet.getByRole('button', { name: 'Получить допуск' })
  await expect(pay).toBeDisabled()
  await sheet.locator('#agree').check()
  await pay.click()
  // живые торги: после допуска — сразу в комнату
  await expect(page).toHaveURL(new RegExp(`/lot/${liveLotId}/room`))
  await expect(page.getByText('Ход торгов')).toBeVisible()

  const offer = page.getByRole('button', { name: /^Предложить/ })
  await offer.click()
  await expect(page.getByText(/Ваша цена — лучшая/)).toBeVisible()

  await page.getByRole('link', { name: 'К лоту' }).or(page.getByRole('button', { name: 'К лоту' })).first().click()
  await expect(page).toHaveURL(new RegExp(`/lot/${liveLotId}$`))
  await expectNotCovered(page, 'В комнату торгов')
  if (isMobile) {
    await expectBottomNavUsable(page)
    await page.locator('nav.fixed').getByRole('link', { name: 'Профиль' }).click()
    await expect(page).toHaveURL(/\/me$/)
    await expect(page.getByText('E2E iPhone 13, 128 ГБ')).toBeVisible() // «Мои лоты» → «Идут сейчас»
  }
})

test('выход из лота до начала торгов: место освобождается, можно снова получить допуск', async ({ page }) => {
  const { scheduledLotId } = fixtures()
  await page.goto(`/lot/${scheduledLotId}?admit=true`)
  await signIn(page)
  const sheet = page.getByRole('dialog')
  await sheet.locator('#agree').check()
  await sheet.getByRole('button', { name: 'Получить допуск' }).click()
  await expect(page.getByText('Вы допущены')).toBeVisible()

  await page.getByRole('button', { name: 'Выйти из лота' }).click()
  await page.getByRole('button', { name: 'Да, выйти' }).click()
  await expect(page.getByText('Вы вышли из лота — место освобождено')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Участвовать' }).last()).toBeVisible()
})

test('лимит: с тремя допусками на ближайшие торги — четвёртый не оформить, видно заранее', async ({ page, isMobile }) => {
  const { liveLotId, limitPhones } = fixtures()
  await page.goto('/register')
  await signIn(page, { phone: limitPhones[isMobile ? 'phone' : 'desktop'] })
  await page.goto(`/lot/${liveLotId}`)
  const cta = page.getByRole('button', { name: 'Уже 3 допуска на ближайшие торги — выйдите из одного' })
  await expect(cta.last()).toBeVisible()
  await expect(cta.last()).toBeDisabled()
  await expect(page.getByRole('dialog')).toHaveCount(0)
})
