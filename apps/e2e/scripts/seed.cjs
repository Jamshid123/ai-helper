// Тестовые данные для сквозных тестов: живые торги, будущие торги и победитель с выкупом.
// Пишет id в .fixtures.json (тесты читают его). БД — только *_e2e (проверяет start-api.sh).
const { createRequire } = require('node:module')
const { writeFileSync } = require('node:fs')
const path = require('node:path')
const requireFromApi = createRequire(path.join(__dirname, '../../api/package.json'))
const { PrismaClient } = requireFromApi('@prisma/client')
const { pickupCode, pickupCodeHash } = requireFromApi('./dist/common/pickup-code.js')

const MIN = 60_000
const H = 60 * MIN

async function main() {
  const db = new PrismaClient()
  const now = Date.now()
  const phones = await db.category.findUniqueOrThrow({ where: { slug: 'phones' } })
  if (!phones.enabled) await db.category.update({ where: { id: phones.id }, data: { enabled: true } })
  const lot = (title, data) =>
    db.lot.create({
      data: { title, condition: 'USED', startPrice: 2_000_000n, step: 100_000n, fee: 12_000n, categoryId: phones.id, ...data },
    })
  const live = await lot('E2E iPhone 13, 128 ГБ', {
    status: 'LIVE',
    opensAt: new Date(now - MIN),
    closesAt: new Date(now + 3 * H),
  })
  const scheduled = await lot('E2E Galaxy S23, 256 ГБ', {
    status: 'SCHEDULED',
    opensAt: new Date(now + 24 * H),
    closesAt: new Date(now + 26 * H),
  })
  // Победитель закрытых торгов: оплатить 10% → код выдачи
  const winnerPhone = '+998901110001'
  const winner = await db.user.create({
    data: { phone: winnerPhone, phoneVerifiedAt: new Date(now), firstName: 'Победитель', publicName: 'Победитель Т.' },
  })
  const sold = await lot('E2E Pixel 8, 128 ГБ', {
    status: 'CLOSED_SOLD',
    opensAt: new Date(now - 3 * H),
    closesAt: new Date(now - 5 * MIN),
  })
  const bid = await db.bid.create({
    data: { lotId: sold.id, userId: winner.id, amount: 3_000_000n, seq: 1, idempotencyKey: '00000000-0000-4000-8000-0000000000e2' },
  })
  await db.lot.update({ where: { id: sold.id }, data: { currentPrice: 3_000_000n, lastSeq: 1 } })
  await db.obligation.create({
    data: {
      lotId: sold.id,
      userId: winner.id,
      bidId: bid.id,
      rank: 1,
      amount: 3_000_000n,
      prepaymentAmount: 300_000n,
      status: 'AWAITING_PREPAYMENT',
      confirmDeadline: new Date(now),
      // в тестах запас по времени: правило «15 минут» проверяют тесты API
      prepaymentDeadline: new Date(now + 2 * H),
    },
  })
  // Админка: победитель оплатил 10% и пришёл за товаром — остаток на месте, выдача по коду
  const pickupBuyer = await db.user.create({
    data: { phone: '+998901110002', phoneVerifiedAt: new Date(now), firstName: 'Покупатель', lastName: 'Выдачи', publicName: 'Покупатель В.' },
  })
  const pickupLot = await lot('E2E MacBook Air M2', {
    status: 'CLOSED_SOLD',
    opensAt: new Date(now - 4 * H),
    closesAt: new Date(now - 2 * H),
  })
  const pickupBid = await db.bid.create({
    data: { lotId: pickupLot.id, userId: pickupBuyer.id, amount: 5_000_000n, seq: 1, idempotencyKey: '00000000-0000-4000-8000-0000000000e3' },
  })
  await db.lot.update({ where: { id: pickupLot.id }, data: { currentPrice: 5_000_000n, lastSeq: 1 } })
  const pickupObligation = await db.obligation.create({
    data: {
      lotId: pickupLot.id,
      userId: pickupBuyer.id,
      bidId: pickupBid.id,
      rank: 1,
      amount: 5_000_000n,
      prepaymentAmount: 500_000n,
      status: 'AWAITING_PICKUP',
      confirmDeadline: new Date(now - 2 * H),
      prepaymentDeadline: new Date(now - 2 * H + 15 * MIN),
      remainderDeadline: new Date(now + 22 * H),
    },
  })
  await db.order.create({
    data: {
      userId: pickupBuyer.id,
      lotId: pickupLot.id,
      purpose: 'PREPAYMENT',
      amount: 500_000n,
      provider: 'fake',
      providerTxId: 'e2e-prepayment',
      status: 'PAID',
      paidAt: new Date(now - 2 * H + 5 * MIN),
    },
  })
  // код выдачи считается так же, как на сервере (секрет — только e2e, см. start-api.sh)
  const code = pickupCode(process.env.JWT_SECRET, pickupObligation.id)
  await db.obligation.update({
    where: { id: pickupObligation.id },
    data: { pickupCodeHash: pickupCodeHash(process.env.JWT_SECRET, pickupObligation.id, code) },
  })
  // Админка: участник, которому ограничат участие
  await db.user.create({
    data: { phone: '+998901110003', phoneVerifiedAt: new Date(now), firstName: 'Нарушитель', lastName: 'Тестов', publicName: 'Нарушитель Т.' },
  })

  const fixtures = {
    liveLotId: live.id,
    scheduledLotId: scheduled.id,
    soldLotId: sold.id,
    winnerPhone,
    admin: { phone: process.env.E2E_STAFF_PHONE, password: process.env.E2E_STAFF_PASSWORD, pickupCode: code },
  }
  writeFileSync(path.join(__dirname, '../.fixtures.json'), JSON.stringify(fixtures, null, 2))
  console.log('e2e fixtures:', { liveLotId: live.id, soldLotId: sold.id, pickupLotId: pickupLot.id })
  await db.$disconnect()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
