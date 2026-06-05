# Codebase Scout Report — mutation-testing oracle

Scope: where a mutation-testing oracle would attach, what it would target, and the constraints that bound it. No implementation approach here — that is `/research`.

## Primary touchpoints

- `package.json` scripts — test runner is `node --test --test-reporter=spec tests/*.test.mjs` (`test`); `test:full` adds `PUBLISH_TESTS=1 PLANTUML_TESTS=1`. **No test framework** (no Jest/Mocha/Vitest) and **no coverage tooling**. A new `test:mutation`-style script would live here.
- `.claude/skills/verify/SKILL.md` — the binding-verdict contract. `.claude/state/last_test_result` is **4 lines** (`PASS|FAIL` / ISO ts / command / exit code); `verify_pass_guard` reads line 1. The mutation oracle is a **separate, advisory signal** (intake AC-005/non-goal) — it must NOT write to `last_test_result` or flip that gate.
- `.claude/skills/integrate/SKILL.md`, `.claude/skills/tdd/SKILL.md` — the loop seam. integrate runs the full suite + stamps the verdict; tdd seeds the worker chain (scenario→implement→verify-tick→drift-check→finalize). An oracle could be a new tick or a standalone invocation; **placement is a codesign decision** (intake open question), not decided here.
- `.claude/project.json` — config-knob carrier. Top-level keys: `test, lint, tdd, destructive, workflow, artifacts, consent, memory, plantuml, git, swarm, whatsnew, additions`. A future tier dial (`-1a2d`) would add a key (e.g. `mutation` or a sub-key under `tdd`); this cut hardcodes defaults but should read from a single obvious place so the dial can later override.

## Entry points that reach this code

- **CLI / npm**: `npm test` (suite), the eventual `npm run test:mutation` (oracle).
- **Skill invocation**: whichever seam the codesign picks — a `/verify`-adjacent sub-check, an integrate sub-step, or a standalone skill.
- The oracle has **no HTTP/cron/queue** entry point; it is a dev-time / loop-time tool.

## Existing tests (dogfood targets for AC-002)

144 `tests/*.test.mjs` files. Strong, small, pure `.mjs` helpers with co-named tests — ideal first mutation targets:

- `.claude/skills/memory-flush/route.mjs` — pure routing logic, `tests/memory-flush-route.test.mjs` (no I/O — cheap to mutate).
- `.claude/skills/brainstorm/discipline.mjs` — `scanTurn` pure scanner, well-tested.
- `.claude/skills/audit-baseline/derive-counts.mjs` — pure counting, co-named test.
- `.claude/skills/memory-flush/next-q-id.mjs` — tiny pure helper.
- `.claude/skills/whatsnew/route-resolver.mjs`, `.claude/skills/triage/seed-tasklist.mjs` — also co-tested.

Pick one pure, fast, no-I/O helper as the AC-001/AC-002 dogfood scope. Avoid helpers that shell out or touch git (slow per-mutant suite runs).

## Constraints and co-changes

- **Bare `node --test` runner** — the mutation tool must drive it directly or via a documented bridge; introducing Jest/Mocha/Vitest is an intake non-goal. `/research` verifies tool support via context7.
- **New dev-dependency** — current devDeps are only `@11ty/eleventy`, `@semantic-release/*`, `nunjucks`. A mutation tool (Stryker etc.) adds a tree → `/security` reviews supply-chain footprint; `audit-baseline` does not currently police devDeps but a heavy add is a review point.
- **Shippability** — a new helper under `.claude/skills/<slug>/` must be `.mjs` (no new Python), and if it's a baseline skill its `SKILL.md` needs `owner: baseline` frontmatter + manifest entry (`obj/template/.claude/manifest.json`). Shipped SKILL.md prose must not reference dev-tree runtime paths (spec-shippability review enforces, and it's wired into intake-full before approve-spec).
- **Runtime budget** — naive mutation = one suite-run per mutant; the suite is ~837 tests. Scoping (changed-files or single-module + running only that module's tests) is mandatory for tractability — this is an AC, not a nicety.
- **`docs/init/seed.md` count claims** — if this adds a skill/hook/command, the governance counts + `audit-baseline` must be updated in lockstep (separate landmine). A standalone npm script + helper avoids touching the skill/hook/command counts.

## Patterns in use here

Helpers are small single-purpose Node ESM `.mjs` modules, stdlib-only, each with a co-named `tests/<name>.test.mjs` using `node:test` + `node:assert/strict`. Config lives in `.claude/project.json` as typed blocks read at runtime (e.g. `git.protected_branches`, `swarm.min_tasks_worth_swarming`) — the established pattern for the future tier dial. State/artifacts under `.claude/state/`.

## Risks / landmines

- **Stryker is framework-runner-oriented.** Its built-in runners target Jest/Mocha/Vitest/Karma; a bare `node --test` suite may need Stryker's `command` runner (runs an arbitrary test command, coarser mutant granularity) or a custom runner. `/research` must confirm the actual current API via context7 — do not assume from training data.
- **Per-mutant cost explosion.** Even scoped, if the oracle runs the *whole* suite per mutant it's unusable. The scope must bound BOTH the mutated files AND the tests run per mutant (ideally just the target module's test).
- **Advisory-not-gate is load-bearing.** AC-005 + a non-goal: the oracle must not write `last_test_result` or be wired into `verify_pass_guard` / commit gates in this cut. Keep it a separate report path.
- **Meta-repo dependency caution.** This repo ships `.claude/` to consumers; a mutation tool is a *dev* dependency only and must not leak into the shipped template or the consumer install surface.
