---
key: .claude/skills/audit-baseline/expected-baseline.mjs
category: landmarks
scope: [scout]
caveat: the roster is the *declaration*; `deriveCounts()` reads disk. Tests assert disk === roster (a real drift tripwire, not tautological). Prose count literals (CLAUDE.md/seed/README/CONSTITUTION) stay hand-maintained but are audit-checked against disk, so they track the roster transitively.
verified-at: 0e5cc8f
last-touched: 2026-07-09
---

- Path: `.claude/skills/audit-baseline/expected-baseline.mjs`
- Role: SINGLE SOURCE OF TRUTH for the baseline's declared rosters. Exports `EXPECTED_HOOKS`, `EXPECTED_AGENTS`, `EXPECTED_COMMANDS`, `EXPECTED_MEMORY_FILES`, `CANONICAL_MEMORY_FILES` (the non-`_` subset), `EXPECTED_MCP_SERVERS`, `EXPECTED_TRACKS`. `audit.mjs` imports the name rosters (extracted out of it); six governance tests import them so a count assertion is `<roster>.size`, never a literal. Adding a hook/command/agent/mcp-server is a ONE-LINE roster edit that re-aligns audit + the whole suite. Skills count stays sourced from `derive-counts.mjs → SKILL_CATEGORIES` (sum); disk counts come from `deriveCounts()`.
- Companion: `.claude/skills/audit-baseline/audit.mjs`, `.claude/skills/audit-baseline/derive-counts.mjs` (disk deriver), tests: `derive-counts`, `epic-close-governance`, `epic-approval-guard`, `git-topology-guard`, `gitignore-governance-cascade`, `whatsnew-counts`.
