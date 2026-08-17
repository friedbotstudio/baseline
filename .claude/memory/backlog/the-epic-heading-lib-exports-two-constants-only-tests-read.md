---
key: the-epic-heading-lib-exports-two-constants-only-tests-read
category: backlog
load_bearing: false
scope: [triage, spec, simplify]
governs: .claude/skills/lib/**, .claude/skills/roadmap/**
status: open
raised-on: 2026-08-17
raised-in-context: unify-epic-heading-grammar
source: assistant-deferral
verified-at: 19631b7
last-touched: 2026-08-17
---

> Flagged at `/simplify` as a `flagged` row and again in the security report's Out-of-scope section: `epic-heading.mjs` exports `STATUS_BY_EMOJI` and `STATUS_EMOJI` which only tests consume, while `parse.mjs:35` keeps an equivalent local map bound to its own `Status` enum.

- **The duplication is real but not obviously wrong.** `parse.mjs:35`'s local `STATUS_BY_EMOJI` binds to that module's own exported `Status` values; the lib's copy binds to bare strings. Collapsing them would couple `parse.mjs`'s public enum to a lib constant, which is a public-API decision rather than a cleanup.
- **Why it was not fixed in-cycle.** `/simplify`'s scope is mechanical cleanup; changing a spec-committed public export is explicitly out of scope there and needs its own spec. `STATUS_EMOJI` is additionally load-bearing as documentation of the non-global contract — see [[a-global-regex-with-test-fails-open-on-alternate-calls]] — so deleting it is not free either.
- **The question to settle.** Should the lib export the status map at all, or should `parse.mjs` own it and the lib expose only `STATUS_EMOJI_SOURCE`? Either answer is defensible; nobody has decided.
- Related: [[the-epic-heading-grammar-has-one-declaration-site]].
