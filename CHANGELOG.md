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

### Changed
- DNS `expertly.uz` в Vercel зафиксирован в решениях и скилле `deploy`.
- Домен исправлен на `auksion.expertly.uz` во всех документах.
