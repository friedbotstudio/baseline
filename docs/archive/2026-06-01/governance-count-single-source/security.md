# Security reports — governance-count-single-source

## governance-count-single-source-2026-06-01.md

# Security Review — governance-count-single-source (WF-5) — 2026-06-01

## Summary

Overall risk: **LOW** (no actionable findings). The change is internal build + audit tooling: a read-only governance-count deriver, an audit-baseline extension, and a computed eleventy data file. No runtime request path, no authentication/authorization surface, no cryptography, no network egress, and no new dependencies. One change is net-positive for security (the `IS_MAIN` realpath fix closes a silent-no-op bug in the audit). Reviewed the working-tree diff (11 files, +393/−102); not full history.

## What was checked

- **A03 Injection / path traversal** — `deriveCounts(root)` and its helpers (`countTracks`, `countMcpServers`, `skillIsBaselineOwned`) build paths with `join(root, '.claude', …)` / `join(root, '.mcp.json')` using **fixed literal** path segments. `root` is `process.env.CLAUDE_PROJECT_DIR || process.cwd()` in the audit (`audit.mjs:34`) and `path.resolve(__dirname, '../..')` in the site data file (`baseline.cjs:18`) — both trusted, neither attacker-derived. No user/network input flows into any path. No traversal vector.
- **A08 Integrity / supply chain** — `baseline.cjs:19-22` does `await import(pathToFileURL(path.resolve(repoRoot, '.claude/skills/audit-baseline/derive-counts.mjs')))` at **eleventy build time**. The import specifier is a fixed relative path from `__dirname`, not influenceable by page data or external input. ESM-from-CJS dynamic import is a standard eleventy data pattern (mirrors the existing `_data/site.cjs`). Build-time only, trusted repo. No risk.
- **ReDoS** — `COMMANDS_ORIENTATION_RE = /\.claude\/commands\/[^(]*\((\d+)\s+commands?\)/i` (audit.mjs). The `[^(]*` is a negated-class star bounded by a required literal `(`; there is no nested/overlapping quantifier, so no catastrophic backtracking. Empirically linear: a 100,000-char non-matching input evaluates in ~1 ms. The other surface regexes are anchored literals from the audit's own table, never user-supplied.
- **`IS_MAIN` guard (audit.mjs)** — guards the top-level audit run + `process.exit` behind `import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href`. Verified the only way to skip the run is *importing* the module (a test), which is intended. Running it as a script (`node audit.mjs`) executes fully. The `realpathSync` on both sides **fixed** a real defect where a symlinked invocation path (macOS `/tmp`→`/private/tmp`) made the comparison fail, silently skipping the entire audit and exiting 0 — a false-PASS that would have masked drift. No new bypass introduced; an existing one removed.
- **Availability / integrity of removed surfaces** — deleting `site-src/_data/baseline.json` and the duplicated `triage/SKILL.md` track templates *reduces* drift surface (single source of truth). The runtime track materialization already read `workflows.jsonl`; the deleted prose was reference-only. The rewired `memory-flush-phase.test.mjs` AC-006 now reads the authoritative `workflows.jsonl`.
- **Secrets hygiene** — no tokens, keys, or `.env` access introduced. The deriver reads only counts/owner-frontmatter from existing repo files.

## Dependencies

No new packages. `npm audit --omit=dev` → **0 vulnerabilities**. Eleventy (`@11ty/eleventy@3.1.5`, pre-existing devDep) is the only framework touched, used via its documented data-file API.

## Out of scope / Noted

- The deriver reads `.mcp.json` and `SKILL.md` frontmatter with defensive `try/catch` + `existsSync` guards; a malformed file degrades to a count of 0 for that artifact rather than throwing. That is a correctness/robustness property (a malformed file would surface as a count mismatch in the audit), not a security issue.
- `deriveCounts` is invoked at both audit time and site-build time in a trusted developer/CI context. If the baseline's threat model ever expanded to running the deriver against untrusted repo contents, the path-segment trust assumption should be revisited — out of scope here.

