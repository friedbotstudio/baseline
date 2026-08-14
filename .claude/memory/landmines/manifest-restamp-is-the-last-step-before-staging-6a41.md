---
key: manifest-restamp-is-the-last-step-before-staging-6a41
category: landmines
scope: [simplify, integrate, commit]
source: assistant-deferral
raised-on: 2026-08-09
raised-in-context: read-front-door-sweep
verified-at: 8201af6
last-touched: 2026-08-14
governs: scripts/build-template.sh, .claude/skills/audit-baseline/audit.mjs, obj/template/.claude/manifest.json
---

> Editing two baseline-owned files after stamping the manifest re-broke the audit, so I re-stamped. That's the rebuild tax.

- **The trap.** Any edit to a file listed in `obj/template/.claude/manifest.json → files` makes `audit-baseline` exit 1 with `skill ownership: <skill> FAIL hash mismatch at <path>`. Article XII drift detection has no opt-out, so the audit stays red — and every test that asserts the audit exits 0 fails with it — until the manifest is re-stamped.
- **The remedy.** `bash scripts/build-template.sh --manifest-only` rebuilds the template and re-stamps hashes without the full audit pipeline. It writes only `obj/template/**`, which is gitignored, so it adds nothing to the diff.
- **The ordering rule, which is the actual landmine.** The re-stamp must be the LAST thing before staging. It bit twice in one cycle: stamped after `/simplify`, then two more baseline-owned files were edited during the security fixes, and the audit went red again with 12 test failures. Each subsequent edit to a baseline-owned skill invalidates the previous stamp.
- **What it looks like when you miss it.** A dozen unrelated-looking test failures — `test_when_audit_baseline_runs_then_exit0`, `epic-close governance`, `standup governance`, `hook decision paths` — all of them assertions that the audit exits 0. The failures name governance concerns and read like real regressions; they are one stale hash.
- **Cheapest diagnosis.** Run `node .claude/skills/audit-baseline/audit.mjs 2>&1 | grep FAIL`. If every row says `hash mismatch`, it is the rebuild tax and nothing else.
