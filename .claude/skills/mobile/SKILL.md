---
name: mobile
description: Use when starting or changing apps/mobile — the Android/iOS client built with React Native (Expo) on top of the same /api/v1 as the Telegram Mini App. Covers auth without Telegram, secure token storage, push notifications, store builds.
---

# Mobile (React Native + Expo)

Статус: **не в MVP**. План этапов и риски — `docs/plans/mobile-app.md`. ТЗ требует, чтобы каталог и торги жили на общих серверных правилах, и Android/iOS подключались к тому же API. Этот скилл — правила на момент старта мобайла.

## Принципы

- Никакой бизнес-логики, которой нет на сервере. Мобайл — ещё один клиент `/api/v1`, как Mini App.
- Переиспользуем из `packages/shared`: zod-схемы, типы, enum-ы статусов, `formatSum`, i18n-словари (`ru`, `uz`).
- Expo (managed workflow) + Expo Router + TanStack Query. EAS Build/Submit для сторов.
- TypeScript strict, те же ESLint-правила.

## Аутентификация без Telegram

- Вход по телефону через SMS OTP (в Mini App телефон берётся из Telegram-контакта; для мобайла нужен SMS-провайдер — согласовать отдельно).
- Сервер должен связывать аккаунт по подтверждённому телефону, чтобы допуски и история были общими между Mini App и мобайлом.
- Токены — только в `expo-secure-store` (Keychain/Keystore). Не в AsyncStorage.
- Refresh-токен ротируется; при подозрении (повторное использование) — выход на всех устройствах.

## Безопасность

- Только HTTPS; в конфиге нет секретов (всё в бандле публично).
- Отключить логирование ответов API в release-сборке.
- Deep links (`auksion://lot/<id>`, universal links на `auksion.expertly.uz`) — параметры валидируются, никаких действий без подтверждения пользователя.
- Скриншоты экрана с кодом выдачи — по желанию заблокировать (`expo-screen-capture`).

## Real-time и пуши

- Тот же WebSocket-протокол (`lastSeq`, снапшот, события по `seq`). При уходе приложения в фон — отключаемся, при возврате — ресинк.
- Push (Expo Notifications → FCM/APNs): открытие торгов, перебитая ставка, победа, дедлайны выкупа. Те же типы и дедупликация, что у Telegram-уведомлений на сервере.

## Проверка

- [ ] `pnpm -F mobile lint typecheck test`.
- [ ] Ключевые сценарии (вход, допуск, ставка, выкуп) — Maestro или Detox e2e на эмуляторе.
- [ ] Сборка EAS preview проходит.
