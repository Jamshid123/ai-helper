# @auksion/miniapp — Telegram Mini App покупателя

React 19 + Vite + Tailwind 4 + TanStack Router/Query. Палитра B, шрифт Onest, тексты ru/uz.
Telegram — через официальный `telegram-web-app.js` (обёртка `src/app/telegram.ts`).

## Запуск

```bash
cp apps/miniapp/.env.example apps/miniapp/.env.local   # VITE_DEMO_DATA=true — тестовые данные
pnpm --filter @auksion/miniapp dev                      # открывается и в обычном браузере в демо-режиме
```

## Режимы

- **Внутри Telegram** (есть `initData`) — данные API `/api/v1`: вход по `initData`, допуск, комната (опрос каждые 3 с), автопредложение, напоминания. `VITE_DEMO_STAND=true` — плашка «Тестовый запуск» (сервер имитирует оплату).
- **В обычном браузере** или при `VITE_DEMO_DATA=true` — демо-стенд на тестовых данных.

## Демо-стенд

Тестовые лоты, имитация оплаты допуска, комната торгов с «другими участниками».
Ставки проверяются теми же правилами, что и на сервере (`src/entities/lot/engine.ts` + `@auksion/shared`).
Плашка «Демо-стенд» показывается всегда в этом режиме. Без демо-режима приложение работает только внутри Telegram.

## Устройство

| Что | Где |
|---|---|
| Telegram: MainButton, BackButton, haptics, initData | `src/app/telegram.ts` |
| Тексты ru/uz (+ тест совпадения ключей) | `src/app/i18n.tsx` |
| Контракт лота | `src/entities/lot/types.ts` |
| Хуки данных (API в Telegram / демо в браузере) | `src/entities/lot/api.ts` |
| Клиент API (вход по initData, ошибки) | `src/shared/api/` |
| Правила ставок для демо (+ тесты) | `src/entities/lot/engine.ts` |
| Тестовые данные и имитация комнаты | `src/entities/lot/demo-data.ts`, `demo-store.ts` |
| Экраны | `src/routes/`: каталог `index.tsx`, лот `lot.$lotId.index.tsx`, комната `lot.$lotId.room.tsx`, профиль `me.tsx` |

## Что дальше (с API)

Допуск через платёжного партнёра; комната по WebSocket вместо опроса (`lastSeq`, ресинк);
телефон через «Поделиться контактом»; экраны победы (30% за 15 мин, остаток за 24 ч, код выдачи).
Тексты на узбекском вычитать носителю языка.
