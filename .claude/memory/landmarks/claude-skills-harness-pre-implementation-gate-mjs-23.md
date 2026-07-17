---
key: .claude/skills/harness/pre-implementation-gate.mjs:23
category: landmarks
scope: [scout]
source: inferred-from-code
verified-at: 45b2620
last-touched: 2026-07-17
---

- Path: `.claude/skills/harness/pre-implementation-gate.mjs` (`checkImplementationReady({slug, rootDir})`)
- Role: gate-collapse D-6 — the relocated machine **BLOCKED** checkpoint. With the human spec gate gone (direction token written at intake), this replaces the removed gate-A token BLOCKED cross-check. The harness calls it after `spec-shippability-review` + checker fan-out and before `implementation`; `ready:false` (any `BLOCKED` verdict) → EXIT LOOP with YIELD, `ready:true` (CLEAN, or absent/malformed → fail-safe ready) → proceed. Not a consent gate — a mechanical integrity checkpoint. Validates slug (`assertSafeSlug`, CWE-22 REJECT) before any path read.
