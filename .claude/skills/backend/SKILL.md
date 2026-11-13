---
name: backend
description: Use when writing or changing server code in apps/api or packages/shared — NestJS modules, Prisma schema and migrations, bidding/auction logic, payments and webhooks, BullMQ jobs, WebSocket rooms, Telegram bot/auth. Covers module layout, transactions and row locks, idempotency, money and time handling.
---

# Backend (NestJS + Prisma + PostgreSQL + Redis)

Сначала прочитай `docs/PROJECT_CONTEXT.md` §3–4 (модули и инварианты). Тесты пишутся по скиллу `testing`, безопасность — по `security`.

## Структура

```
apps/api/src/
  main.ts                 # bootstrap: Fastify, helmet, CORS whitelist, ValidationPipe, shutdown hooks
  config/                 # zod-схема env; приложение падает при старте, если переменной нет
  common/                 # guards (auth, roles), interceptors (audit, idempotency), filters, decorators
  modules/<name>/
    <name>.module.ts
    <name>.controller.ts  # только HTTP: DTO in → service → DTO out
    <name>.service.ts     # бизнес-логика, транзакции
    <name>.repository.ts  # (опционально) сложные запросы / raw SQL
    dto/                  # zod/class-validator схемы запросов и ответов
    <name>.service.spec.ts
  prisma/schema.prisma, migrations/
packages/shared/          # zod-схемы, enum-ы статусов, константы правил — общие для api/miniapp/admin/mobile
```

Правила:
- Модуль не лезет в таблицы чужого модуля напрямую — только через его сервис. Исключение: чтение в отчётах админки.
- Контроллер тонкий. Никакой логики в контроллере, никаких Prisma-вызовов.
- Ответы API — явные DTO. Никогда не отдавать Prisma-модель целиком (утечка полей: IMEI, телефон, ФИО).
- Константы правил (шаг ≥ 100 000, 30%, 15 мин, 24 ч, 50 дней, окно 09:00–18:00) — в `packages/shared/src/rules.ts` и в настройках из БД, не разбросаны по коду.
- API версионируется префиксом `/api/v1`. OpenAPI генерируется из кода — это контракт для mobile.

## Деньги и время

- Суммы — `BigInt` в Prisma (`BigInt` колонка), в JSON — строка. Никаких `number` для денег, никакого `float`.
- 30% предоплаты: `ceil(amount * 30 / 100)` в целых сумах; правило округления зафиксировать в `rules.ts` и тесте.
- В БД всё в UTC (`timestamptz`). Календарь (пятница 09:00–18:00) и дедлайны считаются в `Asia/Tashkent` через `date-fns-tz` или `Temporal`-полифил. Никогда не использовать время клиента для решений.
- Узбекистан без перехода на летнее время, но не полагайся на это — используй IANA-зону.

## Ставка — эталонная реализация

Ставка — самое критичное место. Делается в одной транзакции:

```ts
// bids.service.ts
async placeBid(userId: string, lotId: string, amount: bigint, idempotencyKey: string) {
  return this.prisma.$transaction(async (tx) => {
    // 1. Идемпотентность: тот же ключ → тот же результат
    const existing = await tx.bid.findUnique({ where: { userId_idempotencyKey: { userId, idempotencyKey } } });
    if (existing) return toBidResult(existing);

    // 2. Блокируем строку лота — конкурентные ставки ждут здесь
    const [lot] = await tx.$queryRaw<LotRow[]>`
      SELECT id, status, current_price, start_price, step, seller_id, ends_at, last_seq
      FROM lots WHERE id = ${lotId}::uuid FOR UPDATE`;

    // 3. Проверки по актуальному состоянию (под блокировкой)
    assertLotLive(lot, this.clock.now());          // статус LIVE и now < ends_at (18:00)
    await assertAdmission(tx, userId, lotId);       // оплаченный допуск именно на этот лот
    await assertNotRestricted(tx, userId);          // нет активного бана 50 дней
    assertNoConflictOfInterest(lot, userId);        // не продавец, не сотрудник с доступом
    assertMinAmount(lot, amount);                   // первая ≥ start, далее ≥ current + step

    // 4. Запись: монотонный seq, серверное время
    const seq = lot.last_seq + 1;
    const bid = await tx.bid.create({ data: { lotId, userId, amount, seq, idempotencyKey } });
    await tx.lot.update({ where: { id: lotId }, data: { currentPrice: amount, lastSeq: seq, leaderId: userId } });
    await tx.outboxEvent.create({ data: { type: 'bid.accepted', lotId, payload: {...} } });
    return toBidResult(bid);
  }, { isolationLevel: 'ReadCommitted', timeout: 5000 });
}
```

- Уникальные индексы — последняя линия защиты: `(lot_id, seq)`, `(user_id, idempotency_key)`.
- Отказ — типизированная ошибка (`BID_TOO_LOW`, `LOT_CLOSED`, `NO_ADMISSION`, ...) + актуальная цена в ответе, чтобы клиент обновился.
- `clock` — инжектируемый сервис времени (для тестов «ставка в 18:00:00 отклоняется»).

## События и real-time

- **Transactional outbox**: событие пишется в таблицу `outbox_events` в той же транзакции; воркер публикует в Redis/WebSocket и помечает отправленным. Не публиковать в сокет внутри транзакции.
- WebSocket (Socket.IO + Redis adapter): комната `lot:<id>`. Подключение — только с валидной сессией. Событие содержит `seq`, `serverTime`, `amount`, `publicName`.
- Переподключение: клиент шлёт `lastSeq`, сервер отдаёт снапшот лота + пропущенные ставки `seq > lastSeq`.
- «Сейчас в комнате» — счётчик в Redis, на правила не влияет.

## Фоновые задачи (BullMQ)

- Открытие лотов (пт 09:00), закрытие (пт 18:00), дедлайн предоплаты 15 мин, остатка 24 ч, снятие бана через 50 дней, сверка зависших платежей.
- Каждая задача **идемпотентна**: `jobId` детерминированный (`close:<lotId>`), внутри — проверка статуса под `FOR UPDATE` и переход только из ожидаемого состояния.
- Закрытие лота: `LIVE → CLOSED_SOLD | CLOSED_UNSOLD`, создаёт ровно одно обязательство (уникальный индекс по `lot_id` в obligations).
- Не полагаться только на таймер: при старте приложения и раз в минуту — «догоняющий» sweep просроченных состояний.

## Статусы — конечные автоматы

Переходы лота, заказа, обязательства выкупа описываются явной таблицей разрешённых переходов в `packages/shared`. Любой переход — через одну функцию, которая проверяет таблицу и пишет историю. Прямой `update({status})` запрещён.

## Платежи

- Провайдер пока не выбран → интерфейс `PaymentProvider` (`createOrder`, `verifyWebhook`, `getStatus`, `refund`) + `FakePaymentProvider` для dev/тестов. Реальный адаптер (Click/Payme/Uzum) добавляется отдельным модулем.
- Заказ: `id`, `purpose` (`ADMISSION | LISTING | PREPAYMENT | REMAINDER`), `amount` (сумы), `status`, `providerTxId` (unique).
- Успех — только по проверенному вебхуку (подпись) **или** запросу статуса у провайдера. Сверить сумму, валюту, ID заказа. Повторный вебхук → no-op (unique `providerTxId` + проверка статуса).
- Оплата допуска после закрытия торгов → автоматически на возврат.

## Telegram

- Аутентификация Mini App: проверка `initData` на сервере (`@telegram-apps/init-data-node`, `validate(initData, BOT_TOKEN, { expiresIn: 3600 })`), затем выдаём свою короткоживущую сессию (JWT 15 мин + refresh в httpOnly cookie или в памяти клиента).
- Телефон: пользователь жмёт «Поделиться контактом» → бот получает `message.contact`; принимаем только если `contact.user_id === message.from.id`. Телефон в Mini App из `responseUnsafe` — не доверять.
- Вебхук бота: проверять заголовок `X-Telegram-Bot-Api-Secret-Token`.
- Уведомления через бота: дедупликация по ключу `(userId, type, entityId)`; уважать лимиты Telegram (≈30 msg/s) — отправка через очередь.

## Чек-лист перед коммитом

- [ ] Новая логика покрыта тестом (сначала тест — см. `testing`).
- [ ] Миграция Prisma создана и проверена на чистой БД; деструктивные миграции — отдельно и с согласия.
- [ ] Нет утечки чувствительных полей в DTO/логи.
- [ ] Изменения env → `.env.example` и `config/` схема.
- [ ] `pnpm -F api lint typecheck test` — зелёные (показать вывод).
