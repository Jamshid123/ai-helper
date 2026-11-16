# Как вносить изменения

Правила — в [`AGENTS.md`](AGENTS.md); здесь — практика. Работают двое (каждый со своим AI-агентом: Claude Code или Codex),
поэтому всё идёт через `main` и pull request.

## Цикл задачи

```bash
git fetch origin && git switch -c codex/lot-pickup origin/main     # ветка от свежего main: claude/… | codex/… | <имя>/…
# … изменения, тесты, CHANGELOG/STATUS/CODEMAP/PROJECT_CONTEXT по AGENTS.md …
git fetch origin main && git rebase origin/main                   # перед PR — подтянуть main
pnpm lint && pnpm typecheck && pnpm test && pnpm build
git push -u origin codex/lot-pickup                                # и открыть PR в main по шаблону
```

- Одна задача — одна ветка — один PR. Маленькие PR мержатся быстрее и реже конфликтуют.
- В `main` напрямую не пушим; force-push — только в свою ветку.
- Мерж — человек, после зелёного CI. Мерж в `main` автоматически выкладывает сайт, API и админку на сервер (workflow Deploy, с откатом при неудачной проверке здоровья).
- Если ваш PR смержили, а вы продолжаете работу — новая ветка от свежего `main` (или `git rebase origin/main`), а не продолжение старой.

## Где чаще всего бывают конфликты

| Файл | Как поступать |
|---|---|
| `CHANGELOG.md` | В `.gitattributes` для него стоит `merge=union`: записи из обеих веток сохраняются. После rebase проверьте, что раздел `[Unreleased]` читается. |
| `docs/STATUS.md`, `docs/CODEMAP.md` | Правьте только свои строки; при конфликте оставьте обе версии смысла. |
| `apps/api/prisma/migrations/` | Миграции не правим задним числом. Если в `main` появилась новая миграция, а у вас своя — после rebase переименуйте свою папку на более позднюю метку времени и проверьте `pnpm --filter @auksion/api test`. CI проверяет, что схема (`schema.prisma`) совпадает с миграциями. |
| `pnpm-lock.yaml` | Не решайте вручную: возьмите версию из `main` и выполните `pnpm install`. |
| `apps/miniapp/src/app/i18n.tsx` | Ключи `ru` и `uz` должны совпадать (тест). |

## Скиллы и правила агентов

- `AGENTS.md` — единственный файл правил. `CLAUDE.md` только подключает его (`@AGENTS.md`), отдельно правила туда не пишем.
- Скиллы — `.claude/skills/<name>/SKILL.md`; Codex видит их через ссылки `.agents/skills/<name>`. Новый скилл = папка + ссылка (`ln -s ../../.claude/skills/<name> .agents/skills/<name>`); `scripts/check-agent-skills.sh` в CI это проверяет.
- На Windows нужны symlink в git: `git config core.symlinks true` (и режим разработчика), иначе ссылки станут текстовыми файлами.

## Подключение Codex (партнёр)

1. Владелец репозитория приглашает партнёра в репозиторий с правом записи (GitHub → Settings → Collaborators).
2. Codex CLI / IDE: клонировать репозиторий и запустить `bash scripts/agent-setup.sh`. Codex сам читает `AGENTS.md` и скиллы из `.agents/skills/`.
3. Облачный Codex: подключить GitHub-репозиторий, в настройках окружения указать setup-скрипт `bash scripts/agent-setup.sh`
   и переменные `TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/auksion_test`, `TEST_REDIS_URL=redis://127.0.0.1:6379`
   (в облаке нет Docker — скрипт ставит PostgreSQL и Redis пакетами). Секреты сервера Codex не нужны.

## Секреты

Секреты живут только в GitHub (Settings → Secrets and variables → Actions) и в `.env` на сервере. В репозиторий,
описания PR, логи и чаты они не попадают. CI проверяет коммиты на секреты (gitleaks).
