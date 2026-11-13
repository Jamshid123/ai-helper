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
- CI (`.github/workflows/ci.yml`): gitleaks, `pnpm audit`, lint, typecheck, браузерные тесты, build. Actions закреплены по SHA.
- Палитра B «Шафран» в админке (светлая и тёмная темы), токен `brand-ink` для акцентного текста, фирменный знак и favicon.
- Раздел «Дизайн» (§10) в `docs/PROJECT_CONTEXT.md`.

### Changed
- DNS `expertly.uz` в Vercel зафиксирован в решениях и скилле `deploy`.
- Домен исправлен на `auksion.expertly.uz` во всех документах; админка — `auksion-admin.expertly.uz`.
- Зафиксированы сервер, бот @auksionchi1_bot и соседний проект на сервере.
- На старте выдаётся одна роль сотрудника — ADMIN; остальные роли остаются в коде для подключения позже.
- Из шаблона админки удалены: Clerk, axios, faker, демо-разделы (чаты, задачи, приложения, пользователи, настройки), регистрация и восстановление пароля, вход через соцсети, хранение токена в JS-cookie.
