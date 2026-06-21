# Security reports — audit-baseline-docsite-drift

## audit-baseline-docsite-drift-2026-06-21.md

# Security Review — audit-baseline-docsite-drift — 2026-06-21

## Summary
Overall risk: **LOW**. The change adds three pure string-inspection helpers (`sectionSlice`, `checkDocsiteTracks`, `checkDocsiteHookTable`), a local `selectableTrackIds()` reader, and a read-only wiring block to `.claude/skills/audit-baseline/audit.mjs` — a maintainer/CI-invoked drift-audit script. No trust boundary is crossed: every input is already-trusted in-repo content (`site-src/*.njk`, `.claude/workflows.jsonl`), and the script writes nothing to project code. No secrets, network, crypto, auth, deserialization of untrusted data, or new dependencies are involved.

## Findings

No CRITICAL, HIGH, MEDIUM, or LOW findings.

Checks performed against the diff:
- **A03 Injection** — no `eval`, no shell-out, no dynamic `RegExp`, no SQL. Matching is `String.prototype.includes` / `String.prototype.indexOf` (linear, no ReDoS surface). Clean.
- **A08 Software & Data Integrity** — `JSON.parse` of each `workflows.jsonl` line is wrapped in `try/catch` (`continue` on malformed line), and `track.track_id` is type-guarded (`typeof === 'string'`) before use. A malformed or hostile workflows.jsonl line degrades to "skipped", never a crash or coerced value. Clean.
- **A02 Cryptographic Failures** — no cryptography introduced. N/A.
- **A05 Security Misconfiguration** — the new checks make the audit *stricter* (catch silent docsite drift), reducing the chance a stale governance surface ships. Net-positive for configuration integrity.
- **Secrets hygiene** — no tokens, keys, or `.env` reads. Clean.
- **Input validation** — `readText` returns `''` for missing files, so the `if (text)` guards skip the checks on consumer installs with no `site-src/` tree; no unguarded file reads. Clean.

## Dependencies
No new packages. Pure Node stdlib (`fs` via existing `readText`) + existing `derive-counts.mjs` import.

## Out of scope / Noted
- The memory-file edits in the diff (`conventions.md`, `landmarks.md`, `landmines.md`, `libraries.md`) are `verified-at`/`last-touched` date restamps from the earlier `/memory-flush` stale re-verification — no executable content, no security relevance.
- `obj/template/**` (rebuilt by `npm run build` to refresh the manifest hash) is gitignored and not part of the committed surface.

