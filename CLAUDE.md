# CLAUDE.md

Все правила работы — в `AGENTS.md` (общие для Claude Code, Codex и людей). Здесь только то, что относится к Claude Code.

@AGENTS.md

## Только для Claude Code

- Скиллы лежат в `.claude/skills/` (это те же файлы, на которые ссылается `.agents/skills/` для Codex); вызывай их через Skill.
- `.claude/settings.json` запрещает читать секреты и сгенерированные артефакты — не обходи этот запрет.
- Рабочая ветка сессии Claude Code — `claude/<тема>`; PR в `main` открывается по правилам `AGENTS.md`, п. 3.
