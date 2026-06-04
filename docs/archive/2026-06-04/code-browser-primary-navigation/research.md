# Pattern Research — code-browser-primary-navigation

No third-party library is involved — the change touches internal governance (`CLAUDE.md`, `seed.md`, `CONSTITUTION.md`) and a skill (`code-browser/SKILL.md`, its `description:`). **context7 is therefore N/A here** (nothing to verify against an external API). The candidates below are *routing-mechanism* options, evaluated against the scout's core finding: the primacy claim **already exists** in the annex (`CONSTITUTION.md:112`) and seed (`seed.md:231`) yet the symptom persists, because it is (1) in the read-on-demand layer, not the always-loaded `CLAUDE.md`; (2) frontend-framed so backends self-exclude; (3) silent about the Explore agent.

## Candidate A: Binding-layer doctrine relocation + deframe (prose only)

- **Summary**: Add a terse navigation-routing rule to `CLAUDE.md` as an Article X project-amendment (mirrors the X.2 "Design-task routing" precedent) stating code-browser's universal walk is the first attempt for navigation questions, with Explore/grep as fallback only on no-resolvable-structure or a dead-ended walk. Deframe the existing `seed.md` §4.3 + `CONSTITUTION.md` Appendix B mentions from frontend-only to language-agnostic. Rewrite `code-browser/SKILL.md` to lead with the universal walk and demote `walk.mjs`/`discover.mjs` to "optional JS/TS accelerator." Broaden the skill `description:` (the auto-invoke trigger) to cover backend navigation phrasing and name Explore alongside grep.
- **API references (current)**: none (internal-only change; context7 N/A).
- **Fits**: **Yes** — directly addresses all three root causes the scout named (wrong layer → move to always-loaded CLAUDE.md; frontend framing → deframe; Explore-silent → name it). Uses the existing Article X amendment pattern (`CLAUDE.md:253` X.2). Ships to consumers because `CLAUDE.md`, `seed.md`, `CONSTITUTION.md`, and the skill all travel in the template (scout: `COPY_EXCLUDE` empty, `bin/cli.js:24`).
- **Tests it enables**: artifact assertions — the CLAUDE.md Article exists and states the fallback boundary; the SKILL.md leads with the universal walk and frames the helper as optional; the `description:` is language-agnostic and names Explore; `walk.mjs`/`discover.mjs` byte-identical; mirrors (`src/CLAUDE.template.md`, `src/seed.template.md`) in sync; `audit-baseline` PASS; skill count still 40, hooks still 22.
- **Tradeoffs**: It is *still prose*, and prose in the annex already failed once. The bet is that placement+framing (not "prose can't bind") was the failure, and the always-loaded binding layer + a deframed trigger will hold. No structural enforcement; relies on the model honoring the rule. Reversibility: high — it is doctrine, blast radius is a few governed files + a rebuild.

## Candidate B: A + an advisory navigation nudge in a hook

- **Summary**: Everything in A, plus a structural reinforcement: an advisory PreToolUse surfacing that detects navigation-shaped use of the Task/Explore or Grep tools and surfaces "this looks like a navigation question — code-browser's universal walk is the primary path here." Modeled on the existing advisory `process_lifecycle_guard` (surfaces, never blocks).
- **API references (current)**: none (internal; context7 N/A).
- **Fits**: **Partial** — the standing constraint is "keep the hook count at 22; do NOT add a 23rd" (CLAUDE.md Article VIII; reiterated in backlog e579). The existing 22 hooks match `Bash` / `Write|Edit|MultiEdit` / lifecycle events — **none currently match the `Task`/`Grep`/`Glob` tools**, so there is no clean existing hook to "fold into"; this would be net-new matcher surface and effectively a 23rd hook. Also tension with Article II (navigation judgment lives in main context) and a noise risk (nagging on every grep).
- **Tests it enables**: same as A, plus a unit test on the nudge's detection predicate (navigation-shaped vs term-sweep).
- **Tradeoffs**: Stronger pull toward code-browser, but at the cost of the 22-hook line, added noise, and a detection predicate that itself has false-positive/negative risk (deciding "is this navigation?" mechanically is the same hard problem). Higher complexity for uncertain marginal benefit over A.

## Candidate C: Description-only (skill-trigger) change

- **Summary**: Only rewrite the `code-browser` `description:` to be language-agnostic and navigation-primary; leave the constitution/seed as-is and rely on the Skill auto-invoke-on-description-match mechanism.
- **API references (current)**: none.
- **Fits**: **No (insufficient)** — this is a strict subset of A. It fixes the frontend-framing of the trigger but leaves the binding rule in the read-on-demand layer, where the scout showed it does not bind. Necessary but not sufficient.
- **Tests it enables**: description-shape assertion only.
- **Tradeoffs**: Smallest change, but doesn't address the "wrong layer" root cause; likely to under-deliver on the intake's primacy goal.

## Recommendation

**Candidate A.** The scout evidence is that the primacy claim failed because of *placement and framing*, not because prose can't work — it was never in the always-loaded `CLAUDE.md` binding layer, it was frontend-shaped, and it ignored Explore. A fixes exactly those three, follows the established X.2 amendment precedent, respects the 22-hook and 40-skill non-goals, and fully reaches consumer installs. C is a subset of A and under-delivers. B's hook has no clean existing home (no current hook matches Task/Grep), so it would breach the 22-hook line for uncertain benefit.

**What would flip it to B**: if, after A ships and is exercised on the eval set (a frontend and a backend repo), the model still defaults to Explore/grep for navigation — i.e., binding-layer prose demonstrably doesn't move behavior — then the structural nudge becomes justified and the 23rd-hook line gets revisited deliberately. That is a follow-up, not this workflow.

## Open questions

- **AC testability** (carried from intake): "code-browser is primary" is model-judgment. The spec must decide whether ACs are *artifact checks* (Article present + boundary stated; SKILL.md leads with universal walk; description deframed + names Explore; helpers byte-identical; mirrors synced; audit PASS) — recommended, deterministic — or an *eval-set* artifact (navigation questions across a frontend + backend repo) which is non-deterministic and harder to gate `/integrate` on. Recommendation leans artifact checks for the binding ACs, with the eval set as documented success-metric evidence, not a gating test.
- **Where the CLAUDE.md rule lives**: new Article X.5 (project-amendment, lighter, mirrors X.2) vs touching a core Article (II's main-context-decision theme) — the latter triggers seed-first precedence (Article I.4) more heavily. Spec to choose; X.5 amendment is the lighter path and still ships.
- **Char cap**: `CLAUDE.md` is near the 40,000-char cap (`audit.mjs:326`); the new Article must be terse, with any detail pushed to the `CONSTITUTION.md` annex.
