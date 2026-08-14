---
key: governance-counts-derive-never-hardcode
category: conventions
scope: [scenario, implement, tdd]
source: user-feedback
convention: Governance counts (hooks / commands / agents / mcp-servers / memory-files / tracks / skills) SHALL NOT be hardcoded as literals in tests. Derive them from the single source: `.claude/skills/audit-baseline/expected-baseline.mjs` rosters (`EXPECTED_HOOKS.size`, `EXPECTED_COMMANDS.size`, `EXPECTED_AGENTS.size`, `EXPECTED_MCP_SERVERS.size`, `CANONICAL_MEMORY_FILES.size`, `EXPECTED_TRACKS`) — and skills from `derive-counts.mjs → SKILL_CATEGORIES` sum. A test asserts `deriveCounts(disk).<x> === <declared roster>` so the assertion is a real drift tripwire, never a tautology, and adding an artifact is a one-line roster edit that re-aligns every test.
why: the 25th-hook addition (`phase-timing-instrumentation`) had to touch `24`-literals in five separate test files — exactly the photocopy-the-volatile-fact smell the user flagged. Centralizing collapsed it to one roster declaration.
applies-to: `tests/derive-counts.test.mjs`, `tests/epic-close-governance.test.mjs`, `tests/epic-approval-guard.test.mjs`, `tests/git-topology-guard.test.mjs`, `tests/gitignore-governance-cascade.test.mjs`, `tests/whatsnew-counts.test.mjs`; `.claude/skills/audit-baseline/expected-baseline.mjs`.
verified-at: 8201af6
last-touched: 2026-08-14
---

- verbatim (user, 2026-06-21):
  > "our tests hardcoding data that is bound to change during development. how about extracting that in a common central place. one place to update and all the tests either break or pass"
  > "skills, commands, subagents, mcp, memoryfiles, and tracks are still hardcoded in tests. let us also update and fold them in this cycle"
- how to apply: when adding/removing a hook/command/agent/mcp-server/track, edit `expected-baseline.mjs` only; never re-introduce a numeric literal in a `*.test.mjs`. Prose count literals in CLAUDE.md/seed/README/CONSTITUTION stay hand-maintained (they ARE the governance content) but are audit-checked against disk — do not re-assert them as test literals. Size-budget literals (e.g. `CLAUDE_TARGET_MAX`) are a separate concern (deliberate lean-guards), raised per precedent when a row legitimately grows the file.
