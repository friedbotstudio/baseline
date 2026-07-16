# Pattern Research — gate taxonomy (C6)

Internal governance machinery; **no third-party library API** is involved, so context7 is N/A
(seed.md §2.5 — any current-docs source satisfies; here the "current docs" are repo precedent).
Candidates differ on the three decisions triage flagged: *where it lives*, *the operation-descriptor
shape*, and *the advisory-map form*.

## Prior art (retrieved)

`retrieve.mjs` returned 115 term-overlap hits, nearly all sharing only generic governance vocabulary.
The load-bearing precedents (already named in `docs/scout/gate-taxonomy.md`):

- `docs/archive/2026-07-15/enforcement-oracle-framework/spec.md` — established the advisory checker
  verdict shape (`{severity|null, checker, message, evidence}`) and fail-open posture. C6 reuses the
  *shape*, not the checker phase-wiring.
- `docs/archive/2026-05-15/branch-aware-git-policy/research.md` + `.claude/hooks/lib/consent-decision.mjs`
  — the `{ allow, mode, reason }` pure-decision precedent, the closest existing analogue to C6's target
  `{ verdict, category, reason }`.
- `.claude/memory/decisions.md` / `libraries.md` — the advisory-first (mutation-oracle) and tier-dial
  read-path patterns.

**Delta not covered upstream:** none of these classify an *operation* into the safe/ask boundary; that
mapping is new and derived below.

## Candidate A: Pure lib · structured descriptor · test-asserted map  *(recommended)*

- **Summary**: A pure module `.claude/hooks/lib/gate-taxonomy.mjs` exporting
  `classifyOperation({ kind, target, meta }) → { verdict: 'safe'|'ask', category, reason }`, where
  `kind` is one of the closed set (git-op / destructive-bash / consent-token-write / phase-skip /
  spec-widen). The caller supplies the already-identified `kind`; the classifier maps it to an XI.12
  category (or `safe`). The advisory map (op-kind→category, and each live consent point→category) is a
  **static data table asserted by a test**, not a runtime hook.
- **API references (current)**: none external. Internal precedent — `consent-decision.mjs:43`
  `decideCommitConsent → {allow,mode,reason}`; `checkers/mutation-score.mjs verdictFromScore`.
- **Fits**: yes — colocated with `consent-decision.mjs` / `tier-dial.mjs` (scout: the pure multi-consumer
  lib home); mirrors the established verdict shape; advisory-only by construction (returns data, touches
  no gate); `unknown kind → ask` is a one-line fail-safe default.
- **Tests it enables**: pure-function unit tests per op-kind (AC-1/2/3), a coverage test that all 4
  categories are reachable (AC-4), a table-driven map test over the live consent points (AC-5), and the
  untouched existing guard suites prove zero drift (AC-6). No mocks — the function is pure.
- **Tradeoffs**: the classifier trusts the caller to supply `kind` — it does not itself parse a raw
  command. That is the point (avoids the `destructive_cmd_guard` regex-drift landmine), but it means a
  future live caller must do feature-extraction before calling. Acceptable now: there is no live caller
  this slice (scout: no entry points).

## Candidate B: Harness checker under `skills/harness/checkers/`

- **Summary**: Frame C6 as a checker like `mutation-score` / `ac-conformance`, registered in
  `checker-fanout.mjs`'s `DEFAULT_CHECKER_REGISTRY` (`name → {phase, run(ctx)→{findings}}`).
- **Fits**: partially. The checker interface is **spec-review-phase-oriented** — it produces `{findings}`
  for a phase boundary and merges into a gate-A verdict. C6 is not a spec-review oracle and has no phase
  to run at this slice.
- **Tests it enables**: registry/merge tests, but they test plumbing C6 doesn't need yet.
- **Tradeoffs**: overfits an interface built for a different job; couples an advisory classifier to the
  fan-out runner with no consumer; the `phase` field would be a fiction. Premature (YAGNI). This is the
  right home *only if* C6 is later wired as a gate-A/verify checker — deferred, not now.

## Candidate C: Descriptor by command-parsing (reuse guard classification)

- **Summary**: The classifier takes a raw command/path and derives `kind` itself by reusing
  `destructive_cmd_guard`'s regexes and `git_commit_guard`'s shape-aware git classification, then maps
  to a category.
- **Fits**: closer to a "real" runtime classifier, but the guards do **not** today expose their
  classification as a pure importable function — this needs a guard refactor to avoid copying regexes
  (copying is the explicit drift landmine from scout + memory
  `shell-command-guards-must-classify-wrapper-and-quote-aware`).
- **Tests it enables**: command→verdict tests, but they duplicate the guards' own suites.
- **Tradeoffs**: largest surface, highest drift risk, requires refactoring live guards for an
  advisory-only slice with no caller. Violates YAGNI and the advisory-only constraint's spirit.

## Recommendation

**Candidate A.** It is the leanest approach that satisfies every AC, sits in the established pure-lib
home, reuses the known verdict shape, and structurally avoids the guard-drift landmine by classifying a
*supplied* op-kind rather than re-parsing commands. It keeps the guards untouched (AC-6 falls out for
free) and defers the checker-wiring (Candidate B) and command-parsing (Candidate C) until a concrete
caller forces them.

**What would flip it:** (a) if a live caller receiving raw commands existed *now*, Candidate C's parsing
would be justified — but none does (scout: no entry points); (b) if C6 were to gate a real phase this
slice, Candidate B's checker home would win — but that contradicts the advisory-only brief.

## Open questions

- **The category→verdict rule per op-kind** — which of the 5 closed kinds map to which of the 4 XI.12
  categories, and which resolve `safe`. This is a routine engineering fork → record in the spec's
  `## Decisions` (`owner: engineer`), reviewed at gate A (XI.12: not a human's-call probe).
- **Should the advisory map be exported for a future runtime consumer, or kept test-only?** Recommend
  test-only this slice (YAGNI; no consumer). Flag for the spec author to confirm.
