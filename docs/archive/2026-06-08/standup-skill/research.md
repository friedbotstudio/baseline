# Pattern Research — add a `standup` recap skill

Internal tooling only (Node ESM + `git` via `child_process` + local Markdown parsing). No third-party library API is introduced, so **context7 was not required** (confirmed against the intake/scout — the only deps touched are Node builtins already in `engines.node >=18.17.0`, `type: module`). The forks below are architecture/governance decisions, not library-API decisions.

Grounding facts confirmed this phase:
- Release rules (`.releaserc.json`): branches `main` + `next`(prerelease); `releaseRules`: scope `release|site|ci|actions` → no release, `type: build` → no release, `type: refactor` → **patch**, `scope: constitution` → **minor**, `breaking` → **minor**; default commit-analyzer otherwise (feat → minor, fix → patch, chore/docs/style/test → none). The 0.x alpha cap (CHANGELOG.md:189-203) keeps feat → minor and breaking → minor within 0.x.
- Test runner: `npm test` = `node --test --test-reporter=spec tests/*.test.mjs` (root `tests/` glob, non-recursive).
- `whatsnew` is the lone `generators`-category skill (`owner: baseline`); on-demand, reads state, emits output, not a workflow phase, never writes CHANGELOG — a near-exact peer of `standup`.

---

## Fork A — session-start surfacing mechanism

### Candidate A1: extend the existing `memory_session_start` hook
- **Summary**: `gather.mjs` exports a compact-recap function; `.claude/hooks/lib/memory_session_start.mjs → buildIndex` calls it and appends a clearly-delimited `## Standup` section to the `additionalContext` JSON the hook already emits.
- **Fits**: Yes — anchors to scout's note that `memory_session_start.mjs:1-30` already builds `additionalContext` under a ~10KB budget. No new hook file, no new event registration.
- **Governance cost**: **Zero hook-count change.** The 22-hook count and its cascade (settings.json wiring, seed.md hook table, Article VIII table, audit hook-count check) are untouched. Only the 40→41 skill cascade applies.
- **Tests it enables**: unit-test the compact-recap formatter as a pure function; the hook integration is already covered by the existing session-start harness.
- **Tradeoffs**: Adds one responsibility to a hook that is otherwise memory-only. Must stay within the ~10KB budget — so the session-start surfacing is the *mechanical* recap only (shipped / staged / backlog counts), compact. The "stay separate" user decision is honored at the **content** level: a distinct `## Standup` section that never mutates the resume snapshot or memory index.

### Candidate A2: add a new `standup_session_start` SessionStart hook
- **Summary**: a 23rd hook fires on SessionStart alongside `memory_session_start`, emitting its own `additionalContext`.
- **Fits**: Weaker — scout flagged this triggers a **parallel 22→23 hook governance cascade**: settings.json registration, seed.md §4.x hook table + count, CLAUDE.md Article VIII table + Article III greeting ("22 hooks"), CONSTITUTION.md hook references, and the audit hook-count + name checks. Materially larger surface than the skill itself.
- **Tradeoffs**: Cleanest separation of concerns (memory vs standup are independent hooks). But two SessionStart hooks both emitting `additionalContext` compete for the same startup-prompt budget with no shared coordination, and the doubled governance cascade is high cost for a cosmetic separation. Reversibility is worse (removing a hook is a count cascade too).

### Recommendation (Fork A): **A1 — extend `memory_session_start`.**
Lowest governance cost (no hook cascade), reuses the existing injection path and budget discipline, and satisfies "stay separate" at the content level (a delimited section, not a merged blob). **This also resolves intake Open-Question 1**: the session-start path carries only the deterministic *mechanical* recap (no judgment — a hook has no main-context loop); the judgment-based "recommended next pickup" surfaces on the **on-demand `/standup`** path. Optionally the session-start section ends with a one-line pointer ("run `/standup` for the full recap + recommendation").
**What would flip it**: if the compact recap can't fit the ~10KB budget alongside the memory index without crowding it out, or if the maintainer wants standup to fire on session events memory does not (e.g. `resume` but not `clear`) — then A2's independent hook is justified.

---

## Fork B — skill category placement (40→41)

### Candidate B1: join the `generators` category (→ 2)
- **Summary**: `SKILL_CATEGORIES.generators: 1 → 2` in `derive-counts.mjs`; standup sits beside `whatsnew`.
- **Fits**: Yes — `whatsnew` and `standup` are the same species: on-demand, read-state-and-report, not a phase. Honest taxonomy.
- **Co-changes**: `derive-counts.mjs:35` `generators: 1→2`; the category-breakdown prose at `seed.md:112` + `seed.md:552` (and mirrors `src/seed.template.md`) "generators (1)" → "(2)"; `CONSTITUTION.md:96` table likewise; the total "40 skills" → "41 skills" everywhere; `CONSTITUTION.md:108` Appendix B gains a `standup` row under generators.
- **Tradeoffs**: Minimal churn, accurate semantics. The word "generators" slightly undersells "recap" but is defensible (it generates a report).

### Candidate B2: new `reporting` category (→ 1)
- **Summary**: add `SKILL_CATEGORIES.reporting: 1`.
- **Tradeoffs**: A new category for a single member violates YAGNI (seed.md: abstract at the third concrete use, not the first). Adds a new category token to **every** breakdown surface (seed.md:112/552, CONSTITUTION.md:96, the "thirteen categories" count in README.md:44 would become "fourteen") — strictly more prose churn than B1 for no taxonomic gain until a second reporting skill exists.

### Recommendation (Fork B): **B1 — `generators` → 2.**
Least churn, truthful sibling grouping, no new category token, keeps README's "thirteen categories" valid. **What would flip it**: if a second recap/report skill is already planned, pre-creating `reporting` amortizes the churn — but nothing in the backlog indicates that today.

---

## Fork C — `gather.mjs` shape and determinism

### Candidate C1: pure `gather({ rootDir, now? })` + thin CLI wrapper
- **Summary**: mirror `sweep.mjs`/`seed-tasklist.mjs` — a pure exported function returning a structured object, plus a thin `if (import.meta.url === ...)` CLI that prints `JSON.stringify(result, null, 2)`. Sub-collectors: `collectRelease()` (last tag via `git describe --tags --abbrev=0`; commits via `git log <tag>..HEAD --format=...`; classify each subject by conventional-commit `type(scope):` prefix; infer aggregate bump by applying the `.releaserc.json` releaseRules precedence then the default feat→minor/fix→patch; pushed-vs-origin via `git rev-list --count @{upstream}..HEAD` / `HEAD..@{upstream}` with a no-upstream fallback), `collectBacklog()` (parse `## <key>` blocks, read `status:`/`parent:`/`superseded-at:`, bucket open/picked-up/dropped, nest children under `parent:`), `collectPendingQuestions()` (parse `## Q-NNN`, condense Question + blocker).
- **Determinism (AC-7)**: all `git` calls via `execFileSync('git', [...])` with fixed args (no shell interpolation — also the security-clean path). **No `Date.now()`/`new Date()` in the diffable core**; if a "today" value is ever needed (e.g. backlog age), inject it via the optional `now` param so tests pin it — the default output path must not read the clock. Stable key ordering in all emitted objects (insertion order / explicit sort) so two runs on identical state diff clean.
- **Fits**: Yes — directly matches scout's "helpers are argv-driven AND export pure functions" pattern. No internal mocking needed (Article VI.3): tests run `gather()` against real fixtures.
- **Tests it enables**: (1) determinism — run `gather()` twice on a fixture, assert deep-equal/byte-equal; (2) classification — feed known commit subjects, assert types + aggregate bump (incl. the `refactor→patch`, scope-`release`→none, `constitution`→minor edge rules); (3) backlog bucketing + epic nesting on a fixture `backlog.md`; (4) graceful degradation — non-git dir / no tags / missing memory files return a well-formed object naming the missing precondition, no throw (AC-6).
- **Test placement**: `tests/standup-gather.test.mjs` so the root `node --test tests/*.test.mjs` glob (the `/integrate` suite) picks it up. Git-dependent cases construct a throwaway fixture repo under a temp dir (real `git init` + commits — no git mocking, VI.3-clean) or assert against the live repo's read-only state.

### Candidate C2: inline everything in SKILL.md prose (no helper)
- **Summary**: SKILL.md instructs the model to run the git/parse steps by hand each invocation.
- **Tradeoffs**: Rejected — defeats the intake's core "consistent, deterministic, fast" goal (AC-7 unachievable without a helper), and re-introduces the manual ad-hoc variance the skill exists to remove. No testable surface.

### Recommendation (Fork C): **C1.**
Only C1 satisfies the determinism AC and the Article II split (mechanical gather in the helper; the pickup recommendation assembled in main context by SKILL.md). **What would flip it**: nothing within scope — C2 fails the acceptance criteria outright.

---

## Recommendation (overall)
- **A1** extend `memory_session_start` (no hook cascade; session-start = compact mechanical recap; judgment recommendation on-demand).
- **B1** `generators` category → 2.
- **C1** pure `gather({rootDir, now?})` + thin CLI, git via `execFileSync`, clock-free core.

This keeps the change to the **40→41 skill cascade only** (no 22→23 hook cascade), one new skill dir (`SKILL.md` + `gather.mjs` + `tests/`… or root `tests/standup-gather.test.mjs`), and a small edit to `lib/memory_session_start.mjs`.

## Open questions (for the human at /spec)
1. **Session-start recommendation depth** — confirm A1's resolution of intake OQ-1: session-start shows the *mechanical* recap + a one-line "run `/standup` for the recommendation" pointer, and the judgment pickup is on-demand only. (If you want a heuristic recommendation at session start too, that logic must be deterministic enough to live in the hook — a simple "smallest open backlog item whose deps are closed" rule, not full judgment.)
2. **Test location** — `tests/standup-gather.test.mjs` (in the `npm test` glob, recommended) vs a co-located `.claude/skills/standup/tests/` dir (like audit-baseline) that the default glob does not run. Recommend the former so `/integrate` exercises it.
3. **Semver-bump fidelity** — should `gather.mjs` replicate the *full* `.releaserc.json` releaseRules precedence (scope-overrides, refactor→patch, constitution→minor) or a simplified feat/fix/none heuristic? Full fidelity is more accurate but couples the helper to the release config. Recommend reading `.releaserc.json` at runtime rather than hard-coding the rules, so the two never drift.
