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

  // «Мои лоты» (решение 18.11.2026): покупатель со всеми состояниями — проверяем группы и тексты.
  // По одному на проект (телефон / компьютер): повторный запрос SMS-кода на тот же номер ограничен.
  async function seedMyLots(phone, rivalPhone) {
    const ml = await db.user.create({
      data: { phone, phoneVerifiedAt: new Date(now), firstName: 'Мои', lastName: 'Лоты', publicName: 'Мои Л.' },
    })
    const rival = await db.user.create({ data: { phone: rivalPhone, firstName: 'Соперник', publicName: 'Соперник С.' } })
    const paidAdmission = async (lotId, userId = ml.id) => {
      const order = await db.order.create({
        data: { userId, lotId, purpose: 'ADMISSION', amount: 12_000n, provider: 'fake', status: 'PAID', paidAt: new Date(now) },
      })
      await db.admission.create({ data: { lotId, userId, orderId: order.id } })
      await db.lot.update({ where: { id: lotId }, data: { admittedCount: { increment: 1 } } })
    }
    const mlLive = await lot('ML Идущие торги', { status: 'LIVE', opensAt: new Date(now - MIN), closesAt: new Date(now + 3 * H) })
    await paidAdmission(mlLive.id)
    const mlSoon = await lot('ML Будущие торги', { status: 'SCHEDULED', opensAt: new Date(now + 20 * H), closesAt: new Date(now + 22 * H) })
    await paidAdmission(mlSoon.id)
    const mlCarried = await lot('ML Повторные торги', { status: 'SCHEDULED', opensAt: new Date(now + 30 * H), closesAt: new Date(now + 32 * H) })
    const mlLost = await lot('ML Проигранный лот', { status: 'CLOSED_SOLD', opensAt: new Date(now - 5 * H), closesAt: new Date(now - 4 * H) })
    await paidAdmission(mlLost.id)
    await paidAdmission(mlLost.id, rival.id)
    await db.admission.create({ data: { lotId: mlCarried.id, userId: ml.id, carriedFromLotId: mlLost.id } })
    const lostBid = await db.bid.create({
      data: { lotId: mlLost.id, userId: rival.id, amount: 2_500_000n, seq: 1, idempotencyKey: crypto.randomUUID() },
    })
    await db.obligation.create({
      data: {
        lotId: mlLost.id, userId: rival.id, bidId: lostBid.id, rank: 1, amount: 2_500_000n, prepaymentAmount: 250_000n,
        status: 'COMPLETED', confirmDeadline: new Date(now - 4 * H), completedAt: new Date(now - 2 * H),
      },
    })
    const mlLeft = await lot('ML Вышел из лота', { status: 'SCHEDULED', opensAt: new Date(now + 40 * H), closesAt: new Date(now + 42 * H) })
    await db.order.create({
      data: { userId: ml.id, lotId: mlLeft.id, purpose: 'ADMISSION', amount: 12_000n, provider: 'fake', status: 'REFUND_PENDING' },
    })
    // выигрыш, 10% оплачены — ждёт выдачи (код — по нажатию)
    const mlPickup = await lot('ML Ждёт выдачи', { status: 'CLOSED_SOLD', opensAt: new Date(now - 3 * H), closesAt: new Date(now - 2 * H) })
    await paidAdmission(mlPickup.id)
    const pickupBid2 = await db.bid.create({
      data: { lotId: mlPickup.id, userId: ml.id, amount: 4_000_000n, seq: 1, idempotencyKey: crypto.randomUUID() },
    })
    const mlPickupOb = await db.obligation.create({
      data: {
        lotId: mlPickup.id, userId: ml.id, bidId: pickupBid2.id, rank: 1, amount: 4_000_000n, prepaymentAmount: 400_000n,
        status: 'AWAITING_PICKUP', confirmDeadline: new Date(now - 2 * H), prepaymentDeadline: new Date(now - 2 * H + 15 * MIN),
        remainderDeadline: new Date(now + 22 * H),
      },
    })
    const mlCode = pickupCode(process.env.JWT_SECRET, mlPickupOb.id)
    await db.obligation.update({
      where: { id: mlPickupOb.id },
      data: { pickupCodeHash: pickupCodeHash(process.env.JWT_SECRET, mlPickupOb.id, mlCode) },
    })
    // выигрыш, 10% не оплачены — аннулирован, ограничение 7 дней
    const mlMissed = await lot('ML Не оплатил 10%', { status: 'CLOSED_UNSOLD', opensAt: new Date(now - 6 * H), closesAt: new Date(now - 5 * H) })
    const missedBid = await db.bid.create({
      data: { lotId: mlMissed.id, userId: ml.id, amount: 2_200_000n, seq: 1, idempotencyKey: crypto.randomUUID() },
    })
    const missedOb = await db.obligation.create({
      data: {
        lotId: mlMissed.id, userId: ml.id, bidId: missedBid.id, rank: 1, amount: 2_200_000n, prepaymentAmount: 220_000n,
        status: 'EXPIRED', expiredReason: 'PREPAYMENT_MISSED', confirmDeadline: new Date(now - 5 * H),
        prepaymentDeadline: new Date(now - 5 * H + 15 * MIN),
      },
    })
    await db.restriction.create({
      data: {
        userId: ml.id, obligationId: missedOb.id, reason: 'Не оплачены 10% за выигранный лот в течение 15 минут',
        startsAt: new Date(now - 5 * H + 15 * MIN), endsAt: new Date(now - 5 * H + 15 * MIN + 7 * 24 * H),
      },
    })
      // статусы оплаты с сервера (шаг 2): банк проводит / попытка отменена / дубль остатка на возврате
    const wonLot = async (title, prepay) => {
      const l = await lot(title, { status: 'CLOSED_SOLD', opensAt: new Date(now - 3 * H), closesAt: new Date(now - 10 * MIN) })
      const b = await db.bid.create({ data: { lotId: l.id, userId: ml.id, amount: 3_000_000n, seq: 1, idempotencyKey: crypto.randomUUID() } })
      const o = await db.obligation.create({
        data: {
          lotId: l.id, userId: ml.id, bidId: b.id, rank: 1, amount: 3_000_000n, prepaymentAmount: 300_000n,
          confirmDeadline: new Date(now - 10 * MIN), ...prepay,
        },
      })
      return { l, o }
    }
    const payAttempt = async (lotId, purpose, state, amount = 300_000n, status = 'PENDING') => {
      const order = await db.order.create({ data: { userId: ml.id, lotId, purpose, amount, provider: 'payme', status } })
      if (state !== null)
        await db.paymentTransaction.create({ data: { provider: 'payme', externalId: crypto.randomUUID(), orderId: order.id, amount, state } })
    }
    const deadline = { status: 'AWAITING_PREPAYMENT', prepaymentDeadline: new Date(now + 50 * MIN) }
    const paying = await wonLot('ML Оплата проверяется', deadline)
    await payAttempt(paying.l.id, 'PREPAYMENT', 1)
    const failed = await wonLot('ML Оплата не прошла', deadline)
    await payAttempt(failed.l.id, 'PREPAYMENT', -1)
    const dup = await wonLot('ML Дубль остатка', { status: 'COMPLETED', completedAt: new Date(now - 30 * MIN) })
    await payAttempt(dup.l.id, 'REMAINDER', null, 2_700_000n, 'PAID')
    await payAttempt(dup.l.id, 'REMAINDER', null, 2_700_000n, 'REFUND_PENDING')

    return { phone: ml.phone, pickupCode: mlCode, liveLotId: mlLive.id, soonLotId: mlSoon.id }
  }
  const myLotsPhone = await seedMyLots('+998901110004', '+998901110005')
  const myLotsDesktop = await seedMyLots('+998901110006', '+998901110007')

  const fixtures = {
    liveLotId: live.id,
    scheduledLotId: scheduled.id,
    soldLotId: sold.id,
    winnerPhone,
    admin: { phone: process.env.E2E_STAFF_PHONE, password: process.env.E2E_STAFF_PASSWORD, pickupCode: code },
    myLots: { phone: myLotsPhone, desktop: myLotsDesktop },
  }
  writeFileSync(path.join(__dirname, '../.fixtures.json'), JSON.stringify(fixtures, null, 2))
  console.log('e2e fixtures:', { liveLotId: live.id, soldLotId: sold.id, pickupLotId: pickupLot.id })
  await db.$disconnect()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
