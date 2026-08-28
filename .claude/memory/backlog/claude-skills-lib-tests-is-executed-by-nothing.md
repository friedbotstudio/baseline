---
key: claude-skills-lib-tests-is-executed-by-nothing
category: backlog
load_bearing: false
scope: [triage, integrate, implement]
governs: .claude/skills/lib/tests/**, .claude/skills/sprint-planner/tests/**, .claude/skills/power/tests/**, .claude/project.json
status: open
deferred: risk
raised-on: 2026-08-17
raised-in-context: unify-epic-heading-grammar
source: assistant-deferral
verified-at: f9e7071
last-touched: 2026-08-23
---

> `.claude/skills/lib/tests/probe.test.mjs` exists on disk and is executed by nothing: not `project.json → test.cmd` (`node --test tests/*.test.mjs`, which globs the repo-root `tests/` only), not `npm test`, not CI.

- **Why it matters here specifically.** `.claude/skills/lib/` now holds `epic-heading.mjs`, which carries the CWE-74 `assertInert` guard. A test directory sitting beside a security-relevant module that never runs is an invitation to add a guard test there and believe it is covering something.
- **Confirmed 2026-08-17**: the directory contains exactly one file, `probe.test.mjs`. The `unify-epic-heading-grammar` workflow put its own tests in the repo-root `tests/epic-heading-grammar.test.mjs` for this reason — that is where the binding command looks.
- **Confirmed 2026-08-23, and it is a class, not one file.** Three stranded test files remain: `.claude/skills/lib/tests/probe.test.mjs`, `.claude/skills/sprint-planner/tests/`, `.claude/skills/power/tests/`. A fourth, `.claude/skills/roadmap-sync/tests/sync.test.mjs`, was resolved by relocation in `epic-11-heading`.
- **The sharper stake: a stranded file reads as coverage during triage.** In `epic-11-heading` the 14 tests in `roadmap-sync/tests/sync.test.mjs` were cited out loud as the live guardrail that justified picking the lean `tdd-quickfix` track over `spec-entry`. All 14 passed when run directly and none had ever run in the suite, so `syncRoadmap` — a phase that executes on every committing workflow — had zero live coverage. The original framing here (someone might ADD a test there and believe it covers something) understates it: an EXISTING stranded file already misleads anyone who greps for coverage before choosing a track.
- **Three candidate fixes, and one now has a precedent.** Widen the test glob to `.claude/skills/**/tests/*.test.mjs`; delete the stray directory; or relocate the file into `tests/` and fix its import depth. The relocation is the one that has been done: `git mv` to `tests/roadmap-sync-core.test.mjs`, two import paths rewritten, 14 tests green on arrival and no change to what the binding verify command means. Widening is still a real decision because it changes the binding command's coverage; relocation does not.
- Raised in the security report's Out-of-scope section as "worth closing".
