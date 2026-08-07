---
key: swarm-heuristic-counts-zero-components-for-any-ref-spec-4d21
category: backlog
scope: any
status: open
source: assistant-deferral
raised-on: 2026-08-06
raised-in-context: corpus-recall-reachability
verified-at: d4a1a47
last-touched: 2026-08-06
---

> One finding worth recording for Cycle 2, not acting on now: the swarm-vs-solo heuristic counts `^\s*Component\(` lines in the spec. A spec that satisfies the structural kinds via `@ref` has zero, so **every spec-as-diff spec routes to solo regardless of real component count**. Correct outcome here — this is one coherent change — but it silently disables the swarm path for Cycle 2 onward.

- **The defect.** `harness/SKILL.md` decides swarm-vs-solo with `grep -cE '^\s*Component\(' docs/specs/<slug>.md` against `swarm.min_tasks_worth_swarming` (default 3). `seed.md` §9 tells a spec to satisfy the C4 kinds with `@ref element:<id>` **instead of** drawing them. The two rules are in direct tension: satisfying §9 guarantees a count of 0.
- **Why it matters now.** `@ref` was affordance-only until this cycle; with the guard/preflight parity fixed it is usable, so specs will start using it. Every one routes solo, silently — no warning, no override prompt, and the harness reports the decision as if it measured something.
- **Not merely cosmetic.** The count also gates the spec skill's API-surface pinning rule (D7), which fires at the same threshold. A referencing spec skips that too.
- **Candidate fix.** Resolve each `@ref` element to its shard and count the `Component(` declarations there, or count elements + drawn components together. Either way the count should reflect the model the spec points at, not only the text it inlines.
- **Do not fix by reverting `@ref`** — that re-derives the standing structural model per cycle, which is what `docs/system/` exists to stop.
