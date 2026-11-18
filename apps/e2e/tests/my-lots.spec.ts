import { expect, test } from '@playwright/test'
import { expectBottomNavUsable, fixtures, signIn, skipOnboarding } from './helpers'

test.beforeEach(({ page }) => skipOnboarding(page))

/**
 * «Мои лоты» в профиле (решение 18.11.2026): что сделать → идут → предстоящие → история; итог и взнос — с сервера.
 * Покупатель из тестовых данных: ждёт выдачи, повторные торги без подтверждения, идущие и будущие торги,
 * проигранный лот, вышел из лота (взнос возвращается), не оплатил 10% (ограничение 7 дней).
 */
test('профиль: «Мои лоты» по группам; код выдачи по нажатию; история свёрнута; ограничение видно на лоте', async ({
  page,
  isMobile,
}) => {
  // свой покупатель на проект: повторный запрос SMS-кода на тот же номер ограничен
  const myLots = fixtures().myLots[isMobile ? 'phone' : 'desktop']
  const { liveLotId } = fixtures()
  await page.goto('/register')
  await signIn(page, { phone: myLots.phone })
  await page.goto('/me')

  const block = page.locator('section[aria-labelledby=my-lots]')
  await expect(block.getByRole('heading', { name: 'Мои лоты' })).toBeVisible()
  const headings = await block.locator('h3').allInnerTexts()
  expect(headings).toEqual(['Нужно действие', 'Идут сейчас', 'Предстоящие'])

  // Нужно действие: выкуп ждёт выдачи — код скрыт до нажатия
  await expect(block.getByText('ML Ждёт выдачи')).toBeVisible()
  await expect(block.getByText(myLots.pickupCode)).toHaveCount(0)
  await block.getByRole('button', { name: 'Показать код' }).click()
  await expect(block.getByText(myLots.pickupCode)).toBeVisible()
  // повторные торги без подтверждения — тоже действие
  await expect(block.getByText('ML Повторные торги')).toBeVisible()
  await expect(block.getByText(/подтвердите участие/)).toBeVisible()

  // Идут сейчас: кнопка в комнату
  const toRoom = block.getByRole('link', { name: 'В комнату торгов' })
  await expect(toRoom).toBeVisible()
  await expect(toRoom).toHaveAttribute('href', `/lot/${myLots.liveLotId}/room`)
  // Предстоящие: дата и «взнос оплачен»
  await expect(block.getByText('ML Будущие торги')).toBeVisible()
  await expect(block.getByText(/взнос оплачен/)).toBeVisible()

  // История свёрнута, внутри — итог и взнос, без имени победителя
  await expect(block.getByText('ML Проигранный лот')).toHaveCount(0)
  await block.getByRole('button', { name: /Показать историю \(3\)/ }).click()
  await expect(block.getByText('Торги завершены, вы не победили')).toBeVisible()
  await expect(block.getByText('Взнос возвращается')).toBeVisible()
  await expect(block.getByText(/10% не оплачены за 15 минут/)).toBeVisible()
  await expect(block.getByText(/Участие в торгах ограничено до \d+ \S+, \d\d:\d\d/)).toBeVisible()
  await expect(block.getByText(/Соперник/)).toHaveCount(0)
  // проигравшему про взнос пока ничего не пишем (решение 18.11.2026)
  await expect(block.getByText(/не возвращается/)).toHaveCount(0)

  if (isMobile) await expectBottomNavUsable(page)

  // Ограничение участия — на странице лота до окна допуска, с датой (а не после галочки и «Оплатить»)
  await page.goto(`/lot/${liveLotId}`)
  const cta = page.getByRole('button', { name: /Участие ограничено до \d+ \S+, \d\d:\d\d/ })
  await expect(cta).toBeVisible()
  await expect(cta).toBeDisabled()
  await expect(page.getByRole('heading', { name: 'Допуск к лоту' })).toHaveCount(0)
})
