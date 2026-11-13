# Карта кода

> Обновляется при каждом добавлении/перемещении модулей (см. скилл `token-economy`). Если расходится с кодом — исправить.

## Сейчас в репозитории

| Путь | Назначение |
|---|---|
| `CLAUDE.md` | Правила работы, таблица скиллов, процесс изменений |
| `CHANGELOG.md` | Журнал изменений |
| `.claude/skills/<name>/SKILL.md` | Скиллы: backend, frontend, mobile, testing, security, deploy, spec-check, token-economy |
| `.claude/settings.json` | Запрет чтения секретов и сгенерированных артефактов |
| `docs/STATUS.md` | Текущее состояние и следующий шаг |
| `docs/PROJECT_CONTEXT.md` | Архитектура, стек, инварианты, решения, открытые вопросы |
| `docs/spec/tz.md` | ТЗ (эталон) |
| `docs/skills-sources.md` | Источники методик скиллов |

## Плановая структура (появится при создании каркаса)

| Путь | Назначение |
|---|---|
| `apps/api` | NestJS API + worker (BullMQ). Модули: auth, users, catalog, inspection, auctions, payments, fulfillment, antifraud, notifications, audit |
| `apps/miniapp` | Telegram Mini App (покупатель) |
| `apps/admin` | Админка сотрудников |
| `apps/mobile` | Expo (не в MVP) |
| `packages/shared` | zod-схемы, типы, правила (`rules.ts`), статусные автоматы, i18n |
| `infra/` | docker-compose, proxy, deploy.sh, backup.sh |
| `.github/workflows/` | ci.yml, deploy.yml |
