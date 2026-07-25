---
key: hoist-single-slug-validator-at-third-use-9f4f
category: backlog
scope: []
status: picked-up
raised-on: 2026-07-12
raised-in-context: durable-plan-slug-guard (`/simplify` flagged row)
source: assistant-deferral
estimated-effort: small (the design call is the work, not the code)
verified-at: ea618e9
last-touched: 2026-07-25
caveat: the load-bearing rule is REJECT, never normalize — see [[slug-path-guards-must-reject-not-normalize-and-three-regex-traps]]. Do NOT "consolidate" by making every site use `canonicalSlug`; that would mask traversals repo-wide.
superseded-at: 2026-07-25
---

> verbatim (assistant, 2026-07-12): "Follow-up chore: hoist a single slug validator once a third caller appears."

- Intent: consolidate the duplicated kebab-slug regex. **RIPE as of 2026-07-25 — the third use arrived and passed.** `/^[a-z0-9][a-z0-9-]*$/` now has FIVE independent in-repo definitions: `.claude/skills/harness/plan-store.mjs:13` (`SLUG_RE`, exported as `assertSafeSlug`, throws), `.claude/skills/harness/consolidate-open-questions.mjs:110` (local, stderr + `process.exit`), `.claude/skills/harness/checkers/ac-conformance.mjs:11` (local, degrades to `{findings: []}`), `.claude/skills/triage/seed-tasklist.mjs:57` (local, stderr + exit), `.claude/skills/whatsnew/fragment-writer.mjs:42` (local, throws).
- Why it was NOT extracted at raise-time: Art. VI.4 abstracts at the **third** concrete use, not the second, and folding a refactor into a security fix widens its blast radius. Raised as `/simplify`'s `flagged` row in `durable-plan-slug-guard`. That deferral condition has now been met.
- The design call to settle (do NOT assume one function fits all five): the uses differ in **layer** (path guard vs CLI-arg validation vs checker precondition) and in **failure mode** (throw / stderr + exit / silent empty). The shared thing is the **predicate**; each caller chooses how to fail. Export a predicate plus the existing throwing `assertSafeSlug` wrapper — do not force every site onto one failure mode.
- CORRECTED 2026-07-25: the previously-named third-use candidate `.claude/hooks/spec_approval_guard.mjs:72` **no longer exists** — that hook was renamed/collapsed to `.claude/hooks/direction_approval_guard.mjs` by Epic 4 D3 (gate-collapse). The equivalent live site is `direction_approval_guard.mjs:58`, which derives `expectedSlug` via `canonicalSlug(stem)` — a **normalizer, not a validator** — and feeds it into `join(CLAUDE_DOTDIR, 'state', 'evidence-ledger', `${expectedSlug}.json`)` at line 74.
- Sibling item in the same blast radius: [[timing-path-builders-lack-assert-safe-slug-a8d2]] — `.claude/hooks/lib/timing.mjs:50-51` (`timingPath`, `approvalTokenPath`) build paths from `wf.slug` with no guard at all, reaching `appendFileSync`. Same fix, same rule; land it with this one rather than separately.

---
