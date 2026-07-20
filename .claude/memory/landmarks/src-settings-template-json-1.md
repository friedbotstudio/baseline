---
key: src/settings.template.json:1
category: landmarks
scope: [scout]
verified-at: 8e6f904
last-touched: 2026-06-23
---

- Role: pristine ship-time template for `.claude/settings.json` — the hook wiring + permissions file that `/init-project` copies (or merges) into a target repo. Declares all 22 baseline hooks across PreToolUse / PostToolUse / SessionStart / Stop / PreCompact / UserPromptSubmit events, plus `permissions.allow`/`deny` for tool gating. The overlay source for `npx @friedbotstudio/create-baseline`.
- Companion: `src/project.template.json:1` (the per-project config it pairs with), `src/CLAUDE.template.md:1` (the constitution template).
- Caveat: adding a new hook requires touching this file AND the matching Article VIII row in `src/CLAUDE.template.md` AND `docs/init/seed.md` §4.1 — the audit cross-checks all three. `$CLAUDE_PROJECT_DIR` is the only valid path prefix for hook commands; absolute paths leak the author's home directory into installed projects.
