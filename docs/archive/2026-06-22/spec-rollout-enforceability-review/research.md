# Pattern Research — spec-rollout-enforceability-review

Internal-baseline work: no third-party libraries except the GitHub Pages REST API (AC-9). The four decisions below are the open architecture choices the scout surfaced. Each is a *recommendation* — `/spec` decides.

## API references (current)

- GitHub REST API — `GET /repos/{owner}/{repo}/pages` returns the site config incl. `build_type`; `PUT /repos/{owner}/{repo}/pages` with body `{"build_type":"workflow"}` updates it. Accepted `build_type` values: `legacy` | `workflow`. Verified 2026-06-22 via https://docs.github.com/en/rest/pages/pages. Invoked from CI as `gh api -X PUT /repos/{owner}/{repo}/pages -f build_type=workflow` (set) or `gh api /repos/{owner}/{repo}/pages --jq .build_type` (read).
- All other "APIs" are internal modules: `tier-dial.mjs → resolveCheckerThreshold`, `spec-diagram-review/oracle.mjs → normalizeFinding`, `harness/checker-fanout.mjs → {runCheckerFanout, mergeVerdicts, DEFAULT_CHECKER_REGISTRY}`, `spec_approval_guard.mjs`. No context7 coverage needed.

---

## Decision 1 — How the checker earns BLOCKER authority

`normalizeFinding` blocks only when `artifact != null && mandatory === true`, and `resolveCheckerThreshold(name)` returns `mandatory:false` for any name outside `DEFAULT_PROFILES`. spec-diagram/spec-traceability are themselves outside the profiles → advisory-only today.

### Candidate 1A — Register the checker in the tier dial, `mandatory:true`
- **Summary**: Add `spec-rollout` to `CANONICAL_CHECKERS` and to all three `DEFAULT_PROFILES` with `mandatory:true` (incl. `internal-tool`, the tier this repo runs). Checker calls `resolveCheckerThreshold('spec-rollout')` and reuses `normalizeFinding` unchanged.
- **Fits**: Yes — it is the tier-dial's own extension contract; keeps one source of truth for severity policy (scout landmine #1).
- **Tests it enables**: tier-dial unit test (new key resolves mandatory:true per profile); oracle test (BLOCKER emitted only because mandatory:true).
- **Tradeoffs**: Touches the shared Foundation module (`tier-dial.mjs` + `src/` mirror + every `resolveAllCheckers` consumer). Must set `mandatory:true` even at `internal-tool` — an *enforceability* invariant that's advisory-by-tier would let the origin bug pass again, defeating the purpose. That's a deliberate divergence from spec-diagram/traceability (which sit advisory pending their own promotion).

### Candidate 1B — Reuse the existing `ac-conformance` key
- **Summary**: The checker calls `resolveCheckerThreshold('ac-conformance')` (already `mandatory:true` in every profile) without adding a new key.
- **Fits**: Partial — semantically adjacent (an `enforced-by` binding *is* an AC-conformance claim) and zero tier-dial change.
- **Tests it enables**: oracle test only; no tier-dial change to test.
- **Tradeoffs**: Semantic overloading. A project tuning `ac-conformance` (floor/ceiling/mandatory override) would silently retune rollout too. Muddies per-checker observability (`resolveAllCheckers` wouldn't list rollout). Cheap now, confusing later.

### Candidate 1C — Block directly on the structured artifact (bypass `normalizeFinding` mandatory-gate)
- **Summary**: The oracle sets `severity:'BLOCKER'` itself for the three structured-defect cases (missing / dangling / non-enforcing `enforced-by`) and `severity:'ADVISORY'` only for the free-prose case — never consulting the tier dial.
- **Fits**: Partial — most self-contained (no Foundation edit), and arguably contract-faithful: the structured `enforced-by` field IS the concrete artifact, and the contract says *artifact → may block*. The `mandatory` tier-gate is a *project-policy* layer, which for a hard enforceability invariant we intentionally don't want dialable to advisory.
- **Tests it enables**: pure oracle tests, no shared-module coupling — the tightest test surface.
- **Tradeoffs**: Diverges from the established `normalizeFinding` pattern the other two oracles use (consistency cost). Loses tier tunability (a `regulated` project couldn't make it *more* strict — but it's already maximally strict, so little is lost). Sets a second precedent for "how an oracle decides severity."

**Rank: 1A > 1C > 1B.** 1A keeps the tier dial as the single severity authority and is the honest "register your checker" path; the only real cost is editing a Foundation module (a known, additive change). 1C is the clean fallback if `/spec` wants zero Foundation blast radius and accepts a documented second severity-decision pattern. 1B is not recommended (overloading). **Flips to 1C** if `/spec` judges the tier-dial edit's ripple (mirrors + `resolveAllCheckers` consumers) too costly for one checker, or wants the invariant explicitly non-dialable.

---

## Decision 2 — Which channel hard-blocks `/approve-spec`

`spec_approval_guard.mjs:51` reads exactly one artifact (`.claude/state/spec-shippability/<slug>.json`, `verdict:BLOCKED`). The checker-fanout's exit-2 only surfaces to the user; it never touches the guard.

### Candidate 2A — Persist the fan-out's merged verdict; generalize the guard to read it
- **Summary**: `runCheckerFanout` already computes a merged verdict via `mergeVerdicts`. Persist it to `.claude/state/checker-fanout/<slug>.json {verdict, findings}`. Extend `spec_approval_guard` to also read that file and deny on `verdict:BLOCKED` (same shape as the shippability branch).
- **Fits**: Yes — one new read path unlocks structural blocking for *every* fan-out checker, paying down the standing "fan-out can't block" debt (scout landmine #2). **Safe**: only checkers resolving `mandatory:true` ever emit a BLOCKER, so spec-diagram/traceability stay advisory until separately promoted — no surprise blocks.
- **Tests it enables**: guard unit test (BLOCKED fan-out verdict denies token; CLEAN allows); fan-out persistence test.
- **Tradeoffs**: Edits the consent-critical `spec_approval_guard` (security-sensitive — exercise `/security` here). Adds a persisted artifact to the fan-out runner. Broadest leverage for least duplication.

### Candidate 2B — Write into the spec-shippability verdict path
- **Summary**: The rollout checker writes its verdict into `.claude/state/spec-shippability/<slug>.json`.
- **Fits**: No — `spec-shippability-review` owns that file; two writers race and overwrite. Conflates two unrelated concerns.
- **Tradeoffs**: Rejected — ownership collision.

### Candidate 2C — A dedicated rollout verdict file the guard also reads
- **Summary**: Checker writes `.claude/state/spec-rollout/<slug>.json`; guard gains a third read branch for it.
- **Fits**: Partial — isolated, no fan-out change.
- **Tradeoffs**: Doesn't generalize — every future oracle-bound checker needs yet another guard branch and another file. N-files / N-edits where 2A is one. Only preferable if `/spec` wants the rollout block path *fully decoupled* from the fan-out.

**Rank: 2A > 2C > 2B.** 2A is the clear win — it makes the fan-out the structural block channel once, for all current and future checkers, and is safe-by-construction via the mandatory gate. **Flips to 2C** only if `/spec` wants to avoid persisting a fan-out verdict or wants rollout's block path independent of fan-out enable/disable.

---

## Decision 3 — Recognizing an AC as "enforcement-type" mechanically

### Candidate 3A — Structured AC `kind:` tag (the oracle)
- **Summary**: An enforcement AC carries a structured marker the checker reads — e.g. the AC row gains a `kind:` token from a fixed enum `{preflight, smoke, error-mapping}`. The checker verifies the prerequisite's `enforced-by: AC-NNN` resolves to an AC whose `kind ∈ enum`.
- **Fits**: Yes — this is the Q-002 decision's spirit ("the structured field IS the mechanical oracle"). Fully decidable, no prose judgment.
- **Tests it enables**: oracle tests for each defect (missing kind, kind not in enum, kind valid).
- **Tradeoffs**: A second spec-format amendment (AC rows gain a `kind`), more author burden, more `artifact_template_guard`/`spec-lint` ripple.
  - **3A-i (tag the AC)**: the referenced AC itself declares `kind:` — the binding can't lie. Stronger.
  - **3A-ii (kind on the prerequisite row)**: `enforced-by: AC-007 (preflight)` — the row asserts the kind. Lighter format change, but the author could assert a kind the AC doesn't actually embody. Weaker oracle.

### Candidate 3B — Prose keyword scan of the referenced AC text
- **Summary**: The checker greps the referenced AC's prose for `preflight|smoke|fails fast|error mapping`.
- **Fits**: No — keyword presence is not proof; this is exactly the LLM-adjacent fragile judgment the proof-obligation contract forbids from *blocking*. "This is not a preflight" matches.
- **Tradeoffs**: Rejected for the blocking path. Acceptable only as an ADVISORY hint.

**Rank: 3A-i > 3A-ii > 3B.** Recommend **3A-i** — tag the referenced AC with `kind:`. It keeps the oracle honest (the AC declares its own enforcement nature; the prerequisite can only point, not assert). **Flips to 3A-ii** if `/spec` judges tagging every enforcement AC too heavy and accepts the weaker "row asserts kind" oracle.

---

## Decision 4 — AC-9 origin-bug remediation shape

### Candidate 4A — Fail-fast preflight step in `release.yml` `deploy-pages`
- **Summary**: Before the deploy step, a job step runs `gh api /repos/${{github.repository}}/pages --jq .build_type` and fails the job with an actionable message unless it equals `workflow`.
- **Fits**: Yes — "fails fast when the precondition is absent" (intake AC-9 verbatim). Converts a silent wrong-deploy into a loud, fixable job failure exactly at deploy time.
- **Tests it enables**: shell-level assertion; the step is the test. Self-dogfooding — this spec's *own* Rollout block lists the Pages precondition with `enforced-by` pointing to this preflight AC.
- **Tradeoffs**: Detects, doesn't auto-fix — the operator must then set the config (but the failure message names the exact `gh api PUT` to run). That's the correct enforcement boundary (CI shouldn't silently mutate repo settings).

### Candidate 4B — New `scripts/bootstrap-pages.mjs` (idempotent setter)
- **Summary**: A run-once/on-demand script doing `gh api -X PUT /repos/{owner}/{repo}/pages -f build_type=workflow`.
- **Fits**: Partial — *fixes* the config but isn't in the deploy path, so it doesn't fail-fast; a rarely-run setup script can itself drift out of habit.
- **Tradeoffs**: Convenience fixer, not enforcement. Needs `gh` auth context. Useful as the thing the 4A failure message points to.

### Candidate 4C — Both (preflight verifies + bootstrap sets)
- **Summary**: 4A as the enforcement gate, 4B as the one-command fix it points to.
- **Tradeoffs**: Complete but more surface for one origin bug; YAGNI tension unless the fixer earns its keep.

**Rank: 4A > 4C > 4B.** Recommend **4A** alone — it is the enforcement that satisfies "fails fast," it's testable, and it lets this spec dogfood its own structured-prerequisite format. **Flips to 4C** if `/spec` wants the one-command fixer shipped alongside; **4B alone is insufficient** (no fail-fast).

---

## Recommendation

Lead with **1A + 2A + 3A-i + 4A**: register the checker in the tier dial (`mandatory:true`), persist+read a merged fan-out verdict in `spec_approval_guard`, recognize enforcement ACs via a structured `kind:` tag, and enforce the Pages precondition with a fail-fast `release.yml` preflight. This set is the most contract-faithful, pays down the "fan-out can't block" debt once for all checkers, and dogfoods the new format on its own Rollout section. The cheaper-blast-radius fallback is **1C + 2C** (self-contained, no Foundation/guard generalization) if `/spec` prefers to minimize edits to shared modules.

## Open questions

- **1A vs 1C** is a real judgment call about whether to edit the `tier-dial.mjs` Foundation module for one checker, or keep severity self-contained. `/spec` (ideally codesign mode) decides.
- **Scope of AC-9** (Decision 4): is the Pages fixer (`bootstrap-pages.mjs`) in this workflow, or split to a follow-up? Intake AC-9 phrases it "and/or."
- **Naming**: confirm the checker's registry/tier-dial name (`spec-rollout` vs `spec-rollout-enforceability` vs `rollout-enforceability`) — it appears in `DEFAULT_CHECKER_REGISTRY`, the tier dial, and `project.json → velocity.checker_fanout.checkers`; pick once.
- **Does 3A-i's AC `kind:` tag belong to THIS spec or is it a broader AC-format amendment** that other checkers (ac-conformance) would also consume? If broader, scope carefully to avoid over-reach beyond `-419d`.
