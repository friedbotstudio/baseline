# Codebase Scout Report — gate taxonomy (C6)

Scope: the slice C6 (a deliberately-coarse safe-vs-ask classifier, advisory-only,
closed input set) touches. Read-only survey; no approach recommended (that is `/research`).

## Primary touchpoints

**The taxonomy source (what C6 formalizes):**
- `.claude/CONSTITUTION.md:313-330` (§5.12) — the XI.12 **closed category list**: the four
  categories (consent-adjacent scope · irreversible/destructive ops · policy flips ·
  contradictory requirements) with per-category examples, plus the timeout rule. This is
  the ground-truth taxonomy the classifier maps onto.
- `CLAUDE.md` Article XI.12 — the binding clause (annex §5.12 carries the detail).

**The live consent points the advisory map must resolve (AC-5):**
- `.claude/hooks/spec_approval_guard.mjs` — gate A token write.
- `.claude/hooks/swarm_approval_guard.mjs` — gate B token write.
- `.claude/hooks/git_commit_guard.mjs:61` — `FORBIDDEN_RE` hard-blocks (history rewrite,
  `--no-verify`, `reset --hard`, worktree path-discard, …) **and** branch-aware commit/push
  consent (imports `lib/consent-decision.mjs`).
- `.claude/hooks/destructive_cmd_guard.mjs:75-88` — three-tier classification already on disk:
  `HARD BLOCK` (catastrophic/irreversible), `ASK` (risky), allow. Reads
  `project.json → destructive.{hard_block_patterns, ask_patterns}`.
- `.claude/hooks/gitignore_leak_guard.mjs` — must-ignore path staged at commit (fail-closed).
- `.claude/hooks/epic_approval_guard.mjs` — epic `approved:true` flip gated on gate-A token.
- `.claude/hooks/consent_gate_grant.mjs` — the UserPromptSubmit boundary that writes gate markers.

**The closed op-set's existing config (AC-1/AC-2 inputs, not to be re-derived):**
- `project.json → destructive.hard_block_patterns` / `ask_patterns` — the destructive-bash regexes
  (e.g. `rm -rf /`, `git reset --hard`, `git clean -f`, `git checkout --`, `git push --force`).
- `project.json → git.{protected_branches, branch_pattern, release_branches, workflow_model}` — the
  commit/push consent surface.

## Precedent patterns to follow

**Verdict shape** — `.claude/hooks/lib/consent-decision.mjs:43` `decideCommitConsent(...)` returns
`{ allow, mode, reason }`. This is almost exactly C6's target `{ verdict, category, reason }` — a
pure function returning a plain-object decision with a human-readable reason.

**Advisory-first oracle** — `.claude/skills/harness/checkers/mutation-score.mjs`
`verdictFromScore(...)` returns `null` (no finding) or `{ severity, checker, message, evidence }`;
**fail-open** when the flag is off / no target / no runner. It "lists survivors" without blocking —
the exact advisory-only posture C6 wants for this slice (never writes an enforcement verdict).

**Checker registry / merge** — `.claude/skills/harness/checker-fanout.mjs` `mergeVerdicts(...)` +
the `DEFAULT_CHECKER_REGISTRY` extension point (`name → { phase, run(ctx) }`). Not required for an
advisory-only classifier, but it's the shape if C6 is ever wired as a checker later.

**Shared pure-lib home** — `.claude/hooks/lib/` holds the pure, multi-consumer modules
(`tier-dial.mjs`, `consent-decision.mjs`, `track-order.mjs`, `spec-content-hash.mjs`). A classifier
consumed by future callers is the same class of artifact. (`.claude/skills/harness/checkers/` is the
alternative home if framed as a harness checker.) `/research` picks the home; both exist today.

## Entry points that reach this code

- **None yet, by design.** This slice is advisory-only and adds no live caller — C6 is built
  *before* autonomy, so nothing consults it to gate a real action. The "advisory map" is a
  test-asserted mapping, not a runtime hook wiring. No consent gate or guard changes its behavior.

## Existing tests

- `tests/ac-conformance-checker.test.mjs`, `tests/mutation-score-checker.test.mjs` — the
  advisory-checker test shape (pure verdict function + fail-open cases) to mirror.
- `tests/checker-fanout*.test.mjs` — registry/merge tests.
- Guard tests (`tests/branch-guard.test.mjs`, and the git/destructive guard suites) — these are the
  suites AC-6 requires to pass **unchanged** (proof of zero enforcement drift). Node's built-in test
  runner (`node --test`), colocated in `tests/*.test.mjs`.
- New coverage lands as `tests/gate-taxonomy*.test.mjs`.

## Constraints and co-changes

- **Manifest regeneration** — the shipped manifest is `obj/template/.claude/manifest.json` (NOT
  `.claude/manifest.json`). A new baseline-owned `.mjs` lib + any SKILL.md must be re-hashed via
  `bash scripts/build-template.sh`; `audit-baseline` FAILs on drift (Article XII).
- **Shipped-helper discipline** — new helpers must be `.mjs`/`.js` (never `.py`); shipped SKILL.md
  prose must not reference `src/`/`tests/` as runtime paths (`spec-shippability-review` enforces).
- **Flag gating** — advisory features here ship behind a `project.json` flag defaulting off for
  consumers (mutation-oracle precedent); the classifier must fail-open when absent.

## Patterns in use here

Pure ESM `.mjs` modules exporting named functions that return plain-object decisions
(`{ allow|verdict, mode|category, reason }`); fail-open for velocity features, **fail-safe**
(default to the conservative side — here `ask`) for safety decisions; config read from
`project.json` with defensive `try/catch` → `{}`; colocated `node --test` suites in `tests/`.

## Risks / landmines

- **Enforcement-drift trap.** The classifier must stay advisory this slice. The cautionary precedent
  is the `verify_pass_guard` "PASS-when-FAIL" failure mode — never let a classifier verdict silently
  downgrade or alter a real gate. AC-6 (existing guard suites pass unchanged) is the guardrail.
- **Duplication/drift with `destructive_cmd_guard`.** That guard already classifies HARD-BLOCK/ASK
  from `project.json` regexes. The advisory map should **reference** the existing classification, not
  re-implement the regexes — a second copy would drift (memory landmine
  `shell-command-guards-must-classify-wrapper-and-quote-aware`, and `classify git subcommands from the
  executable shape, not the raw string`). If C6 parses commands at all, it must reuse the guard's
  shape-aware classification.
- **`safe` is the dangerous default.** Fail-safe means unknown → `ask`; an accidental `safe` default
  would be the exact autonomy risk C6 exists to prevent (AC-2 pins this).
- **Coarseness pressure.** Roadmap says "deliberately coarse, fragment when closer" — resist adding
  category granularity or an open operation abstraction ahead of a concrete v2 caller (YAGNI; intake non-goals).
