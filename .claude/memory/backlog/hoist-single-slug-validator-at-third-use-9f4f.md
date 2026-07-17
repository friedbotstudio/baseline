---
key: hoist-single-slug-validator-at-third-use-9f4f
category: backlog
scope: []
status: open
raised-on: 2026-07-12
raised-in-context: durable-plan-slug-guard (`/simplify` flagged row)
source: assistant-deferral
estimated-effort: small (the design call is the work, not the code)
verified-at: e51a03d
last-touched: 2026-07-12
caveat: the load-bearing rule is REJECT, never normalize — see [[slug-path-guards-must-reject-not-normalize-and-three-regex-traps]]. Do NOT "consolidate" by making every site use `canonicalSlug`; that would mask traversals repo-wide.
---

> verbatim (assistant, 2026-07-12): "Follow-up chore: hoist a single slug validator once a third caller appears."

- Intent: consolidate the duplicated kebab-slug regex. `/^[a-z0-9][a-z0-9-]*$/` now has TWO in-repo definitions — `.claude/skills/harness/plan-store.mjs` (`SLUG_RE`, exported as `assertSafeSlug`) and `.claude/skills/harness/consolidate-open-questions.mjs:110` (`SLUG_RE`, local).
- Why NOT extracted now: Art. VI.4 abstracts at the **third** concrete use, not the second, and folding a refactor into a security fix widens its blast radius. Raised as `/simplify`'s `flagged` row in `durable-plan-slug-guard`.
- The design call to settle when it fires (do NOT assume one function fits both): the two uses differ in **layer** (path guard vs CLI-arg validation) and **failure mode** (throw vs stderr + process exit). The shared thing may be the predicate, with each caller choosing how to fail.
- Third-use candidate already identified: `.claude/hooks/spec_approval_guard.mjs:72` builds `.claude/state/checker-fanout/<slug>.json` from `expectedSlug`, derived via `canonicalSlug` — a **normalizer, not a validator**. Routing that site through the real guard would be the natural third use AND close the noted Windows-backslash gap in the same move.

---
