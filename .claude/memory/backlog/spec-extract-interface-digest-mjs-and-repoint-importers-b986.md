---
key: spec-extract-interface-digest-mjs-and-repoint-importers-b986
category: backlog
scope: [simplify, tdd]
status: open
raised-on: 2026-08-06
raised-in-context: central-system-spec (`/simplify` flagged reconcile.mjs growth)
source: assistant-deferral
estimated-effort: medium (extract a module + repoint importers + move the tests that follow it)
verified-at: d4e6216
last-touched: 2026-08-06
---

> Follow-up spec: extract `interface-digest.mjs` and repoint importers.

**Why.** `.claude/skills/workspace/reconcile.mjs` reached 134 substantive lines this cycle, up from 98, after ticket C added the witness binding on top of the existing three-case staleness logic. Two separable concerns now share a file: deriving a structural interface digest from a source file, and deciding an element's staleness verdict from that digest plus its witness.

**What to extract.** The digest-derivation half — the per-extension structural readers (exported symbols for `.mjs`, sorted key paths for `.json`, heading structure for `.md`) — into `interface-digest.mjs`. `reconcile.mjs` keeps the verdict logic and imports the digest.

**Land this before [[anchor-digest-is-vacuous-for-exportless-files-3f7c]].** That entry is a defect in exactly the code this extraction isolates: the `.mjs` reader returns the empty string for a file with no exports, so all 25 hook elements collide on `sha256("")`. Fixing it inside a freshly extracted module with its own tests is materially cheaper than fixing it inside `reconcile.mjs`, and the extraction gives the fix an obvious home.

**Watch the early return.** `withWitness` carries a load-bearing guard — `if (!shard?.kind) return decorated;` — that keeps a digest-derived `stale` verdict from being overwritten as `moved` when a shard declares no kind. An earlier refactor this cycle dropped it and the staleness tests caught the regression. Preserve it through the move.
