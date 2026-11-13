# Источники скиллов

Скиллы в `.claude/skills/` написаны под этот проект. Идеи и методики взяты из открытых наборов, которые я прочитал и проверил перед использованием. Чужие скрипты, хуки и исполняемый код **не подключены**: только текстовые правила, переписанные с нуля.

| Скилл | Источник идей | Лицензия | Что взято |
|---|---|---|---|
| `testing` | [obra/superpowers](https://github.com/obra/superpowers) — test-driven-development, verification-before-completion | MIT | Цикл red-green-refactor, правило «нет доказательств — нет готово» |
| `testing` | [trailofbits/skills](https://github.com/trailofbits/skills) — property-based-testing | CC BY-SA 4.0 | Идея property-based тестов для инвариантов |
| `security` | trailofbits/skills — insecure-defaults; OWASP ASVS / API Security Top 10 | CC BY-SA 4.0 / CC BY-SA | Категории insecure defaults (fail-open, фолбэк-секреты, дефолтные учётки и т.д.) |
| `spec-check` | trailofbits/skills — spec-to-code-compliance | CC BY-SA 4.0 | Пошаговая проверка требований, шкала вердиктов, рубрика серьёзности, попытка опровергнуть находку |
| `frontend` | Документация Telegram Mini Apps (core.telegram.org/bots/webapps), `@telegram-apps/sdk` | — | Проверка initData, нативные кнопки, тема, safe area |
| `deploy` | Документация GitHub Actions по hardening, Docker best practices | — | Закрепление actions по SHA, минимальные permissions, non-root контейнеры |
| `backend`, `mobile` | Документация NestJS, Prisma, BullMQ, Expo | — | — |

При обновлении скилла из внешнего источника: прочитать изменения целиком, не тянуть исполняемые файлы, обновить эту таблицу.
