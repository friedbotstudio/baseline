---
key: user-shipped-tooling-lives-in-claude-directory
category: conventions
scope: [scenario, implement, tdd]
source: user-instruction
verified-at: 3c74ba8
last-touched: 2026-06-20
---

> verbatim (user, 2026-05-21):
> always add user-shipped tooling inside .claude directory. The only thing that is outside of this directory is CLAUDE.md and .mcp.json (this can be added as convention so that we avoid this question in future)

- Convention: all user-shipped baseline tooling — config files, state files, skills, hooks, agents, commands, memory, manifest — SHALL live under `.claude/`. The only two project-root exceptions are `CLAUDE.md` (the in-session constitution) and `.mcp.json` (the MCP server registry). Documentation files (`README.md`, `CHANGELOG.md`, `docs/init/seed.md`, `docs/specs/`, etc.) are project artifacts, not "tooling," and are out of scope of this convention — they live where existing conventions place them.
- Why: directory placement was an open question at workflow-extension-via-workflows-json's /approve-spec gate (OQ-2: should `workflows.jsonl` go at project root or under `.claude/`?). The user's answer codifies the broader principle to avoid re-asking on every future "where does this new file live?" decision. Resolution: `.claude/workflows.jsonl` (not `workflows.jsonl` at project root).
- How to apply: any future spec phase proposing a new shipped file checks: is it CLAUDE.md or .mcp.json? If neither, it goes under `.claude/`. The choice is no longer open for discussion unless the user explicitly raises it.
- Reference: docs/init/seed.md §3 Directory structure (this convention should be cited there at the next seed.md edit; tracked as part of the workflow-extension-via-workflows-json scope).
