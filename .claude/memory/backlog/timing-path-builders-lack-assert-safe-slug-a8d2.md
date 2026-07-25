---
key: timing-path-builders-lack-assert-safe-slug-a8d2
category: backlog
scope: []
status: picked-up
raised-on: 2026-07-19
raised-in-context: timing-instrument-repair
source: assistant-deferral
estimated-effort: tiny
verified-at: f36b142
last-touched: 2026-07-19
superseded-at: 2026-07-25
---

> verbatim (assistant, 2026-07-19, `/security` LOW finding):
> "timing.mjs path builders lack the assertSafeSlug guard applied in sibling modules — plan-store.mjs:42 calls it inside planPath, throwing before any path is constructed."

- Intent: route `timingPath` and `approvalTokenPath` in `.claude/hooks/lib/timing.mjs:50-51` through `assertSafeSlug` (exported from `.claude/skills/harness/plan-store.mjs`), matching the guard already applied in `plan-store` and `checker-fanout`. `stampFromWorkflow` reaches a real write primitive (`appendFileSync`), so a traversing `wf.slug` would append JSONL outside `.claude/state/timing/`.
- Severity LOW, and the reasoning matters: `slug` comes from `.claude/state/workflow.json`, a developer/Claude-authored in-repo file — not network input, not a CLI arg. Reaching this requires local write access to the repo, which already exceeds what the traversal grants. This is a **consistency gap with guarded siblings**, not an exploitable hole.
- The rule when fixing (do not get this wrong): **REJECT, never normalize.** Do not route through `canonicalSlug` in `common.mjs` — it is a NORMALIZER, and using it here would mask a traversal by silently redirecting the write. See [[slug-path-guards-must-reject-not-normalize-and-three-regex-traps]].
- Pre-existing, not introduced by the `timing-instrument-repair` diff (confirmed: that diff does not touch either path builder). Full analysis: `docs/archive/2026-07-19/timing-instrument-repair/security.md`.
