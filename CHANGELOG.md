# Changelog

Формат: [Keep a Changelog](https://keepachangelog.com/ru/1.1.0/), версии — [SemVer](https://semver.org/lang/ru/).

## [Unreleased]

### Added
- `docs/spec/tz.md` — ТЗ в Markdown (эталон для сверки).
- `docs/PROJECT_CONTEXT.md` — контекст проекта: роли, модули, инварианты, стек, решения, открытые вопросы.
- `CLAUDE.md` — правила работы: скиллы, процесс изменений, changelog, подтверждение перед пушем.
- Скиллы `.claude/skills/`: `backend`, `frontend`, `mobile`, `testing`, `security`, `deploy`, `spec-check`.
- `docs/skills-sources.md` — источники и лицензии методик, использованных в скиллах.
- `.gitignore`.
- Скилл `token-economy`: порядок получения контекста (STATUS → CODEMAP → точечное чтение), короткий вывод команд, поддержание «памяти проекта».
- `docs/STATUS.md` и `docs/CODEMAP.md` — состояние проекта и карта кода, чтобы не переиндексировать репозиторий.
- `.claude/settings.json` — запрет чтения `.env`, ключей и сгенерированных артефактов.

- Монорепо pnpm (`package.json`, `pnpm-workspace.yaml`, `.nvmrc`).
- `apps/admin` на основе shadcn-admin (MIT): вход пароль → TOTP с httpOnly-сессией и CSRF, меню и маршруты по ролям (ADMIN, OPERATOR, EXPERT, RISK, FINANCE, FULFILLMENT, SUPPORT), разделы-заглушки по ТЗ, экран «Обзор» с отсчётом до пятничной сессии по Ташкенту, защита от open redirect, демо-вход только для dev, шрифт Onest без загрузки с Google Fonts, интерфейс на русском.
- Workflow `server-inspect.yml` (ручной запуск, только чтение): осмотр сервера перед настройкой — ОС, порты, сервисы, Docker, reverse proxy, PostgreSQL, SSH.
- CI (`.github/workflows/ci.yml`): gitleaks, `pnpm audit`, lint, typecheck, браузерные тесты, build. Actions закреплены по SHA.
- Палитра B «Шафран» в админке (светлая и тёмная темы), токен `brand-ink` для акцентного текста, фирменный знак и favicon.
- Раздел «Дизайн» (§10) в `docs/PROJECT_CONTEXT.md`.
- `packages/shared`: правила торгов из ТЗ (`minNextBid`, `prepaymentAmount`, сроки), форматирование сумов (bigint), расписание пятничной сессии по Ташкенту — общие для всех приложений.
- `apps/miniapp`: Telegram Mini App — демо-стенд на тестовых данных: каталог с отсчётом до торгов и фильтрами, карточка лота с актом проверки и условиями, допуск с согласием на правила (имитация оплаты), комната торгов (мин. ставка по правилам ТЗ, быстрые шаги, история, «перебили»), профиль с выбором языка. Нативные MainButton/BackButton, тема Telegram, палитра B, ru/uz.
- `infra/Dockerfile.spa` + `infra/nginx/spa.conf`: образ статики (Mini App / админка) на nginx-unprivileged без root, CSP (Mini App встраивается только в Telegram, админка — никуда), кэш ассетов, `/healthz`.

### Changed
- `valibot` (необязательная зависимость `@hookform/resolvers`) закреплён на `^1.2.0` через `pnpm.overrides` — закрыта уязвимость ReDoS (GHSA-vqpr-j7v3-hqw9).
- Расчёт пятничной сессии перенесён из админки в `packages/shared`.
- CI и server-inspect: раннер закреплён на `ubuntu-24.04` (на `ubuntu-latest` = 26.04 Playwright не ставит Chromium).
- DNS `expertly.uz` в Vercel зафиксирован в решениях и скилле `deploy`.
- Домен исправлен на `auksion.expertly.uz` во всех документах; админка — `auksion-admin.expertly.uz`.
- Зафиксированы сервер, бот @auksionchi1_bot и соседний проект на сервере.
- На старте выдаётся одна роль сотрудника — ADMIN; остальные роли остаются в коде для подключения позже.
- Из шаблона админки удалены: Clerk, axios, faker, демо-разделы (чаты, задачи, приложения, пользователи, настройки), регистрация и восстановление пароля, вход через соцсети, хранение токена в JS-cookie.
