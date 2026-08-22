---
key: mcp-server-file-shebang-trips-check-files-diff
category: landmines
scope: [chore, integrate]
verified-at: 8201af6
last-touched: 2026-08-14
caveat: Companion to [[baseline-skill-count-cascade]] (both bite at integrate, not audit — never trust an audit-clean tree as ship-ready when a new `.claude/mcp/` server or a new skill category was added).
---

- Path: `scripts/check-files-diff.mjs` (executable-allowlist check ~line 152-185) + the publish-check test `tests/publish-check.test.mjs` (`test_when_check_files_diff_runs_on_current_tree_then_reports_symmetric_clean`).
- Trap: a NEW MCP server file under `.claude/mcp/**` (e.g. `.claude/mcp/baseline/server.mjs`) with a `#!/usr/bin/env node` shebang is flagged `SURPRISE-EXECUTABLE` by `check-files-diff`. The check treats a file as executable when EITHER `mode & 0o111` OR it carries a shebang `#!` (extension alone is informational) — so even at mode 644 the shebang triggers it. The executable allowlist is ONLY `bin/`, `scripts/`, `.claude/hooks/`, `.claude/skills/*/`; `.claude/mcp/` is NOT on it → `files-diff: 1 violation` → exit 1 → the publish-check symmetric-clean test FAILs. **`audit-baseline` STAYS GREEN** (the audit never runs check-files-diff), so this is caught at `/integrate` (full suite), NOT at audit — same integrate-not-audit class as [[baseline-skill-count-cascade]]'s numToWord category-count sub-trigger.
- Mitigation: OMIT the shebang from `.claude/mcp/**/*.mjs` server files. They run via `node .claude/mcp/<server>/server.mjs` (the `.mcp.json` command), never `./server.mjs`, so the shebang is unnecessary; without it (and at mode 644) the file is a "pure library module" the check allows outside the allowlist. If a future MCP server is published as its own npm package with a `bin`, the shebang lives in THAT package, not the overlay file. (Alternative, NOT taken: add `.claude/mcp/` to the check's allowlist — a governance-tool change; the no-shebang fix is smaller.) Verified live in `sprint-dispatch` slice C — removing the `server.mjs` shebang took the full suite 0→green.
