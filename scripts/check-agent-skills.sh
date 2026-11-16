#!/usr/bin/env bash
# Скиллы общие для Claude Code (.claude/skills) и Codex (.agents/skills — ссылки на них).
# Падает, если у скилла нет ссылки, ссылка битая или в .agents/skills лежит что-то лишнее.
set -euo pipefail
cd "$(dirname "$0")/.."
fail=0
for dir in .claude/skills/*/; do
  name=$(basename "$dir")
  link=".agents/skills/$name"
  if [ ! -L "$link" ]; then echo "нет ссылки: $link → ../../.claude/skills/$name"; fail=1; continue; fi
  if [ "$(readlink "$link")" != "../../.claude/skills/$name" ]; then echo "ссылка ведёт не туда: $link"; fail=1; fi
  [ -f "$link/SKILL.md" ] || { echo "нет SKILL.md за ссылкой: $link"; fail=1; }
done
for link in .agents/skills/*; do
  [ -e ".claude/skills/$(basename "$link")" ] || { echo "лишнее в .agents/skills: $link"; fail=1; }
done
grep -q '@AGENTS.md' CLAUDE.md || { echo "CLAUDE.md должен подключать AGENTS.md (@AGENTS.md)"; fail=1; }
[ "$fail" = 0 ] && echo "skills: ok ($(ls -d .claude/skills/*/ | wc -l))"
exit $fail
