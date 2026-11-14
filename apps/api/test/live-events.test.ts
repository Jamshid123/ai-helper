import { randomUUID } from 'node:crypto'
import { get, type IncomingMessage } from 'node:http'
import type { AddressInfo } from 'node:net'
import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import { PrismaClient } from '@prisma/client'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { loginAs, startApp } from './app'
import { cleanDb, createLot } from './factories'
import { LiveEventsService } from '../src/modules/live/live-events.service'
import { PrismaService } from '../src/prisma/prisma.service'

const db = new PrismaClient()

/** Подписка на поток событий лота: собирает текст, пока тест не закроет соединение. */
function listen(base: string, lotId: string) {
  let text = ''
  let res: IncomingMessage | undefined
  const ready = new Promise<IncomingMessage>((resolve, reject) => {
    const req = get(`${base}/api/v1/lots/${lotId}/events`, (r) => {
      res = r
      r.setEncoding('utf8')
      r.on('data', (c: string) => (text += c))
      resolve(r)
    })
    req.on('error', reject)
  })
  return {
    ready,
    text: () => text,
    close: () => res?.destroy(),
    async waitFor(re: RegExp, ms = 3000) {
      const until = Date.now() + ms
      while (!re.test(text)) {
        if (Date.now() > until) throw new Error(`не дождались ${re}: ${text}`)
        await new Promise((r) => setTimeout(r, 50))
      }
    },
  }
}

describe('Поток событий лота (SSE)', () => {
  let app: NestFastifyApplication
  let base: string
  beforeAll(async () => {
    app = await startApp()
    await app.listen(0, '127.0.0.1')
    base = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`
  })
  beforeEach(() => cleanDb(db))
  afterAll(async () => {
    await app?.close()
    await db.$disconnect()
  })

  async function admit(lotId: string, userId: string) {
    const o = await db.order.create({
      data: { userId, lotId, purpose: 'ADMISSION', amount: 12_000n, provider: 'fake', status: 'PAID' },
    })
    await db.admission.create({ data: { lotId, userId, orderId: o.id } })
  }

  it('принятое предложение приходит подписчикам этого лота и не приходит подписчикам другого', async () => {
    const lot = await createLot(db)
    const other = await createLot(db)
    const s = listen(base, lot.id)
    const s2 = listen(base, other.id)
    const res = await s.ready
    await s2.ready
    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toMatch(/^text\/event-stream/)
    expect(res.headers['x-accel-buffering']).toBe('no')
    expect(res.headers['cache-control']).toBe('no-store')

    const a = await loginAs(app, 910_001, 'Азиз')
    await admit(lot.id, a.userId)
    const r = await app.inject({
      method: 'POST',
      url: `/api/v1/lots/${lot.id}/bids`,
      headers: a.auth,
      payload: { amount: '2000000', idempotencyKey: randomUUID() },
    })
    expect(r.statusCode).toBe(200)

    await s.waitFor(/event: bid\n/)
    const data = s
      .text()
      .split('\n')
      .find((l) => l.startsWith('data: {"seq"'))
    expect(JSON.parse(data!.slice(6))).toMatchObject({ seq: 1, amount: '2000000' })
    // в событии нет ни имени, ни id участника — только публичные данные торгов
    expect(s.text()).not.toContain(a.userId)
    await new Promise((r) => setTimeout(r, 800))
    expect(s2.text()).not.toMatch(/event: bid/)
    s.close()
    s2.close()
  })

  it('старые события не рассылаются повторно: ни при старте, ни спустя время', async () => {
    const lot = await createLot(db)
    const fresh = new LiveEventsService(app.get(PrismaService))
    const ev = (n: number) => ({
      type: 'bid.accepted',
      aggregateId: lot.id,
      payload: { seq: n, amount: '1', serverTime: '' },
    })
    await db.outboxEvent.createMany({ data: [ev(1), ev(2)] })
    await fresh.poll() // старт: запоминает текущий хвост, ничего не шлёт
    const got: unknown[] = []
    fresh.subscribe(
      lot.id,
      (e) => got.push(e.data),
      () => {}
    )
    await fresh.poll()
    expect(got).toEqual([])
    await db.outboxEvent.create({ data: ev(3) })
    await fresh.poll()
    expect(got).toEqual([{ seq: 3, amount: '1', at: '' }])
    // «спустя время»: через несколько минут хвост outbox не перечитывается заново
    vi.useFakeTimers({ toFake: ['Date'] })
    try {
      vi.setSystemTime(Date.now() + 5 * 60_000)
      for (let i = 0; i < 3; i++) await fresh.poll()
    } finally {
      vi.useRealTimers()
    }
    expect(got).toHaveLength(1)
  })

  it('несуществующий лот — 404, а не открытый поток', async () => {
    const s = listen(base, randomUUID())
    expect((await s.ready).statusCode).toBe(404)
    s.close()
  })
})
