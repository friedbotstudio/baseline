---
key: anchor-digest-is-vacuous-for-exportless-files-3f7c
category: backlog
scope: [security, tdd, spec, scout]
status: open
raised-on: 2026-08-06
raised-in-context: central-system-spec (`/archive` sync-back, first real execution)
source: assistant-deferral
estimated-effort: medium (a digest-strategy decision + extractor change + tests; touches the witness rule ticket C just established)
verified-at: d4e6216
last-touched: 2026-08-06
---

> The `anchor-digest` witness cannot detect any change to any hook. 25 of the 60 digested elements carry the same digest, and that digest is sha256 of the empty string.

**The measurement.** `grep -l '^anchor_digest: e3b0c44298fc' docs/system/elements/*.md` returns 25 files. `node -e "console.log(require('crypto').createHash('sha256').update('').digest('hex').slice(0,12))"` returns `e3b0c44298fc`. The 25 are exactly the hook elements: `env-guard`, `git-commit-guard`, `track-guard`, `verify-pass-guard`, `consent-gate-grant`, `destructive-cmd-guard`, `tdd-order-guard`, and the rest of Article VIII.

**The cause.** The `.mjs` structural digest extracts *exported symbols*. Hooks are executable scripts invoked by the runtime, not imported modules, so they carry zero `export` statements — `git_commit_guard.mjs` is 388 lines with 0 exports, `env_guard.mjs` is 38 lines with 0 exports. Both digest the empty string, so they collide with each other and with every other hook.

**Why it is worth a spec.** This landing's ticket C made `anchor-digest` the witness for `c4_component`, `class` and `dependency_graph`, and amended D8 so that a *witnessed* diagram is citable as evidence. The hook layer is the enforcement layer of the constitution. Its diagrams are now formally citable while their witness is incapable of ever changing, so drift there is undetectable and the citability guarantee is false precisely where it matters most. The defect predates this cycle (it came in with `digest.mjs` in the architecture-map epic) but this cycle promoted it from a weak signal to a stated guarantee.

**Directions, none chosen.** Digest the parsed body shape (top-level declarations, not just exports) so a script has an interface; treat an exportless file as `witness: none` so it is honestly marked rather than falsely green; or give hooks an explicit witness of the test that exercises them, which is the `test` tier ticket C already built. The third is the cheapest and reuses shipped machinery.

**Do not fix by re-stamping.** Re-stamping recomputes the same empty digest. The extractor is the thing that is wrong.

**Family.** Same shape as [[a-check-that-measured-nothing-reports-success]] and [[reader-level-grades-rendered-html-so-markdown-passes-vacuously]] — an oracle that reports success because it read nothing. Related work: [[spec-extract-interface-digest-mjs-and-repoint-importers-b986]] is where the extractor would move, so land that first if both are picked up.
