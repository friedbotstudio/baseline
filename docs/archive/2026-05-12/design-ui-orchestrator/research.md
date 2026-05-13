# Pattern Research — design-ui-orchestrator

Six targets, drawn from the intake's Open questions + scout findings. No third-party library APIs to verify via context7; this work is internal architecture only. The candidate set across all six targets stays inside conventions the scout report already documented as the baseline's canonical shape.

---

## Target 1: Where does `design_calls[]` enforcement run?

The rule fires only when a spec's `write_set` intersects `project.json → tdd.ui_globs`. Four candidates for *where* the rule lives.

### Candidate A: Extend `artifact_template_guard.sh`

- **Summary**: Add `"Design calls"` to `project.json → artifacts.required_sections.spec`. The existing hook checks for required `##` headings.
- **API references**: N/A (internal).
- **Fits**: Partial. The hook currently checks an **unconditional** list of required headings. Making `"Design calls"` conditional on `write_set ∩ ui_globs ≠ ∅` requires the hook to (a) parse the spec body for write_set declarations and (b) intersect them with `ui_globs`. The hook's current concern is "every artifact has its required headings" — a flat-list check. The conditional-rule machinery is foreign.
- **Tests it enables**: AC-4 by extension — `npm test` would call the hook with a synthetic spec body. But the test would need to construct an artifact with a UI write_set, which is awkward.
- **Tradeoffs**: Lowest new-file count. Highest concept-coupling cost. Hook becomes harder to reason about.

### Candidate B: Extend `spec_diagram_presence_guard.sh`

- **Summary**: Same code path as A, but coupled to the diagram hook.
- **API references**: N/A.
- **Fits**: No. This hook's contract is *PlantUML diagram kinds*. Adding a non-diagram check confuses the contract entirely. Future readers of the hook would not expect a `design_calls` check inside a "diagram presence" file.
- **Tradeoffs**: Strictly worse than A. Concept mismatch + same conditional-rule complexity.

### Candidate C: New dedicated hook `spec_design_calls_guard.sh`

- **Summary**: A new write-boundary hook scoped to `docs/specs/*.md`. Reads `project.json → tdd.ui_globs` + parses spec body for write_set. If intersection non-empty AND spec body has no `## Design calls` section (or has the section but with empty body), deny the write with a clear reason.
- **API references**: N/A.
- **Fits**: Yes. Matches the canonical pattern: one hook = one rule, scoped narrowly, configured via `project.json`. Mirrors how `plantuml_syntax_guard`, `spec_diagram_presence_guard`, `tdd_order_guard` each handle exactly one rule.
- **Tests it enables**: AC-4 directly — fixture spec with UI write_set + no design_calls → hook returns `permissionDecision: deny`. Test invokes the hook via subprocess with a synthetic payload.
- **Tradeoffs**: +1 hook file (now 21 hooks instead of 20). Audit-baseline EXPECTED_HOOKS set grows by one. seed.md §4.1 count claims update. settings.json wiring gets one more entry. Modest maintenance burden, but the project pays this cost cleanly for every other guard.

### Candidate D: Preflight-only via `spec-lint/lint.sh`

- **Summary**: Add a `check_design_calls` function to the existing 3-check spec-lint script. No write-boundary blocking; the user must run `/spec-lint <slug>` (or `/spec` does it during draft) to surface the issue.
- **API references**: N/A.
- **Fits**: Partial. The multi-check pattern is right there at `.claude/skills/spec-lint/lint.sh:120` (`check_syntax`, `check_presence`, `check_traceability` → `results = [(...)]`). Adding a 4th check is mechanically simple.
- **Tests it enables**: AC-4 partially — the preflight script can be unit-tested by feeding it a fixture spec. But the *write* of a non-conforming spec still succeeds; only the lint report flags it.
- **Tradeoffs**: Loses write-boundary enforcement. A user who skips `/spec-lint` lands a non-conforming spec; `/approve-spec` does not currently re-run the lint, so the spec could reach `/tdd` without `design_calls[]`. Downstream phases would then silently skip the UI design step.

### Candidate E (hybrid): C + D — dedicated hook for write-boundary + spec-lint extension for preflight

- **Summary**: Both layers. The new hook enforces structurally; spec-lint surfaces the same rule during drafting for immediate feedback.
- **Fits**: Yes — this is exactly the existing pattern. `plantuml_syntax_guard` (hook) is paired with `check_syntax` in spec-lint. `spec_diagram_presence_guard` (hook) is paired with `check_presence`. The lint script is the preflight; the hook is the gate.
- **Tradeoffs**: +1 hook + ~50 lines added to lint.sh. Slightly more code than D alone, but the *pattern* is the project's canonical shape and the gate-vs-preflight pair already exists for every spec-shaped check.

### Recommendation — Target 1

**Candidate E (hybrid)**. The hook + spec-lint pair is the project's established pattern for every spec-shaped rule. Choosing D alone loses write-boundary enforcement; C alone loses the preflight loop that drafters actually use. The hybrid costs +1 hook and ~50 lines of lint additions — well below the cost of departing from the pattern.

**What would flip the recommendation**: if the project decided to retire write-boundary hooks for spec rules in favor of approval-time enforcement only (i.e., `/approve-spec` re-runs lint), then D alone becomes coherent. No such retirement is on the table; the scout confirmed all three current spec rules are gate+preflight.

---

## Target 2: Default value for `project.json → tdd.ui_globs` in the pristine template

### Candidate A: Empty array `[]`

- **Summary**: Ship pristine with `ui_globs: []`. `/init-project`'s recommender populates per detected stack.
- **Fits**: Matches the rest of `src/project.template.json` — pristine ships with `configured: false`, null `test.cmd` / `lint.cmd`, empty `additions.*` arrays. Empty `ui_globs` continues the "no enforcement until tailored" posture.
- **Tradeoffs**: Silent under-enforcement if a team installs the baseline and never runs `/init-project`. Project-agnostic mode (per CLAUDE.md Art. III) is sanctioned — users CAN run the baseline without `/init-project`. In that mode, the design lane has no enforcement at all. The intake's AC-5 ("/tdd Step 6 runs when implement's write_set intersects tdd.ui_globs") becomes a no-op when ui_globs is empty.

### Candidate B: Sensible stack-neutral default

- **Summary**: Ship pristine with a curated list of frontend-path glob patterns:
  ```json
  "ui_globs": [
    "app/**/*.{tsx,jsx}",
    "components/**/*.{tsx,jsx,vue,svelte}",
    "pages/**/*.{tsx,jsx,vue,svelte}",
    "src/**/*.{tsx,jsx,vue,svelte}",
    "**/*.html",
    "**/*.css",
    "**/*.scss",
    "**/*.njk"
  ]
  ```
- **Fits**: Catches React/Next.js (app/, pages/), Vue/Nuxt (pages/, components/), Svelte/SvelteKit (src/, components/), Eleventy (site-src/, *.njk), and CSS surfaces universally. Backend-only projects have `write_set ∩ ui_globs = ∅` for all changes, so the rule becomes a no-op without intervention.
- **Tradeoffs**: A team using a stack the defaults don't cover (e.g., Rails ERB, Phoenix HEEx, Astro `.astro`) gets the same under-enforcement as A but with the false sense that the rule is "covered". `/init-project` should still re-tailor.

### Candidate C: Language-derived defaults via `/init-project`

- **Summary**: Pristine ships with `[]`. `/init-project`'s recommender always populates a stack-specific list based on detected framework. The recommender's existing job (per `.claude/skills/claude-automation-recommender/SKILL.md`) is already to populate `additions.*` and stack-specific config; extending it to populate `ui_globs` is natural.
- **Fits**: Matches the "/init-project is where tailoring happens" architecture. The pristine template stays minimal; the live config is where the stack-specific list lives.
- **Tradeoffs**: Project-agnostic mode users get no enforcement (same as A). A new field for the recommender to populate (small cost). Recommender's mapping table needs a row per detected stack.

### Recommendation — Target 2

**Candidate B (sensible default)**, with a comment in the pristine template noting that `/init-project` may replace the list per stack. Rationale: project-agnostic mode is sanctioned and common; teams should get the design-lane rule working out of the box for the standard frontend stacks. Backend-only projects get a no-op rule, which is correct behavior. A team on a non-standard stack will hit either A's or C's silent-under-enforcement problem anyway — B at least covers the 80% case.

**What would flip the recommendation**: if /init-project becomes mandatory (the project drops project-agnostic mode), then A or C becomes equivalent to B in practice. No such change is planned.

---

## Target 3: Stage 0 classification approach

The classification determines whether `design-ui` proceeds or returns `not_a_design_task`. Note: design-ui runs *in Claude's main context*, so "regex match" really means "the SKILL.md gives Claude an explicit deterministic rule table". The choice is between a tight rule table that Claude follows mechanically vs. open-ended judgement.

### Candidate A: Pure keyword/intent-shape table

- **Summary**: SKILL.md ships an explicit rule table: `if intent matches /^(build|create|add) a /i AND target_files all match ui_globs → design; if intent matches /^(fix|add validation|implement) /i AND target_files include .ts/.go/.py logic files → development; ...`. Claude mechanically maps intent → classification.
- **Fits**: Maximally deterministic. AC-1, AC-2, AC-3 each name a specific intent string; this approach maps each to a clear branch.
- **Tradeoffs**: Brittle to phrasing variations ("build a settings page" → design; "build a settings endpoint" → development; both start with "build"). The keyword table grows over time as new patterns surface.

### Candidate B: Intent string + target_files heuristic

- **Summary**: Same keyword table as A, but augmented by inspecting `task_brief.target_files`. If write_set is all `.ts`/`.go`/`.py` logic files (no UI globs match), classification leans development regardless of intent phrasing. If write_set is all `.css`/`.njk`/`.tsx` UI files (no logic files), classification leans design. Tie-breakers go to the keyword table.
- **Fits**: Reduces brittleness from A. target_files is decisive when the intent is ambiguous. The intent table from the locked design already lists ~18 patterns; the target_files heuristic kicks in only when the keyword match is ambiguous or missing.
- **Tradeoffs**: For no-target intents (direct user invocation "improve typography on the brand"), falls back to keyword-only. Acceptable — those invocations are direct-user mode where Claude can ask the user.

### Candidate C: Pure LLM judgement (no rule table)

- **Summary**: SKILL.md instructs Claude: "classify the intent as design / development / copy; here are 3 examples per lane; use your judgement." No explicit rule table.
- **Fits**: Most flexible. Handles edge cases gracefully. But undermines AC-1/AC-2/AC-3 testability — those ACs name specific intent strings with expected classifications; without a deterministic rule, the test's expected outcome is "whatever Claude says today".
- **Tradeoffs**: Loses determinism. Tests for AC-1 would have to be probabilistic ("usually returns not_a_design_task for this intent") or model-version-pinned. The baseline's other tests are deterministic; this would be the outlier.

### Recommendation — Target 3

**Candidate B**. Intent keyword table + target_files heuristic. The keyword table goes in `references/intent-table.md` (per Target 4 below) and is the primary classifier; target_files breaks ties. Tests fix the intent string + target_files and assert the classification is deterministic. This matches how the baseline's other "Claude follows a rule" skills work — `track_guard` reads `workflow.json`; `tdd_order_guard` reads `project.json → tdd.test_globs`; rules are tables Claude consults, not freeform judgement.

**What would flip the recommendation**: if AC-1/2/3 are relaxed to "the classification is correct in ≥ N% of cases", C becomes coherent. As written, the ACs are binary — flip would mean rewriting the intake.

---

## Target 4: Intent classification table location

### Candidate A: Inline in SKILL.md

- **Summary**: Full intent → impeccable-recipe table (~18 rows) sits in SKILL.md.
- **Fits**: Single file. But the SKILL.md is loaded on every invocation; the table is a one-time read at orchestration time. Always-loading a 18-row table is context cost without benefit.
- **Tradeoffs**: SKILL.md becomes harder to scan. The "Stage 1, Stage 2, Stage 3" flow is the load-bearing structure; the table is reference material.

### Candidate B: External `references/intent-table.md`

- **Summary**: SKILL.md has a 3-row summary table + "see references/intent-table.md for the full mapping". Claude loads the references file when it needs the full table (i.e., when classifying an intent that doesn't match the summary's 3 cases).
- **Fits**: Matches `impeccable`'s precedent — the parent skill puts each command's instructions in a separate `reference/<cmd>.md` file. Same pattern, lowercase, plural.
- **Tradeoffs**: Two files instead of one. Marginal cost.

### Recommendation — Target 4

**Candidate B**. The pattern is already established by `impeccable`. The full table lives in `references/intent-table.md`; SKILL.md keeps the Stage flow and a 3-row hot-path summary.

**What would flip the recommendation**: only if the table shrank to ≤ 5 rows, inline would be coherent. As designed it's ~18 rows.

---

## Target 5: `design_calls[]` as top-level section vs subsection

### Candidate A: Top-level `## Design calls` after `## Design`

- **Summary**: A new `##` heading sits between `## Design` (the C4+UML+contracts block) and `## Acceptance criteria`.
- **Fits**: Matches `artifact_template_guard`'s contract — the hook checks for required `##` headings via `project.json → artifacts.required_sections.spec`. Adding `"Design calls"` to that list is one-line. The new dedicated hook (Target 1 / Candidate E) can then check the section is *non-empty* when the conditional fires.
- **Tradeoffs**: One more major section heading. The spec template already has 11 top-level sections; this becomes 12. Manageable.

### Candidate B: Subsection `### Design calls` under `## Design`

- **Summary**: A `###` heading inside the existing `## Design` block.
- **Fits**: Groups design-related material together. But `artifact_template_guard` only checks `##` headings; enforcement would need either (a) a hook change to also check `###` headings or (b) a separate hook that finds the `### Design calls` anchor. More plumbing.
- **Tradeoffs**: Less prominent in the spec's TOC. Harder to enforce.

### Candidate C: Embedded inside an existing table or list under `## Design`

- **Summary**: Add design calls as a row in an existing table (e.g., the Contracts table) or as a bullet list.
- **Fits**: No. Design calls are not contracts; they're orchestration directives for the design lane. Co-locating muddles concerns.
- **Tradeoffs**: Strictly worse than A or B.

### Recommendation — Target 5

**Candidate A**. Top-level `## Design calls` section after `## Design`. Mirrors the spec template's existing rhythm (top-level = major concerns), enforceable via the existing required-sections machinery, prominent in the TOC, and the section can have a `*(none)*` body when no UI files are in the write_set (matching the `## Archive plan` "Extras: *(none)*" precedent).

The required-sections entry stays unconditional (every spec has a `## Design calls` heading), but the new hook (Target 1 / C) checks for *non-empty body* only when the conditional fires. This avoids putting conditional logic in `artifact_template_guard`.

**What would flip the recommendation**: if the spec template's top-level section count became a real concern, B with a hook change becomes coherent. No such concern is in flight.

---

## Target 6: 3-iteration loop cap behavior on hit

### Candidate A: Return to caller; caller decides

- **Summary**: design-ui returns `{ final_state: "needs_human", audit_report_path, remaining_p0_p1_count }`. The caller (/tdd Step 6, or the user) decides next.
- **Fits**: Clean separation of concerns — design-ui orchestrates impeccable; routing the failure is the caller's job. /tdd Step 6 receives `needs_human` and decides: fail Step 6, warn and continue, or yield.
- **Tradeoffs**: Each caller needs a policy. For /tdd Step 6, the policy choices are:
  1. Fail /tdd: treats unaddressed design P1s as on par with failing tests. Likely too strict — behavior tests pass; design is a separate dimension.
  2. Warn and continue to Step 7: lets /tdd close GREEN with an open design follow-up.
  3. Yield /tdd: stop the workflow until the user resolves the design state.

### Candidate B: State checkpoint + yield (like /harness yields)

- **Summary**: design-ui writes `.claude/state/design/<slug>.json` with `state: "needs_human"` and stops. Resume on next `Skill(design-ui)` call with same slug.
- **Fits**: Matches the workflow's yield pattern (e.g., `/spec` yields for `/approve-spec`). But inside an *already-orchestrated* /tdd flow, this nested yield is awkward — /tdd would have to surface "design-ui yielded; address P1s and resume" and the user would need to know how to address P1s before re-running /harness.
- **Tradeoffs**: Heavier UX cost. Doubles the yield surface.

### Candidate C: Memory candidate via memory_stop hook

- **Summary**: design-ui's final return includes a memory candidate (per the `pending-questions.md → Q-002` precedent). memory_stop auto-extracts the candidate into `_pending.md` at session end.
- **Fits**: Captures the long-term knowledge. But doesn't actually block or surface the design failure; the P1s sit unaddressed until someone runs `/memory-flush`.
- **Tradeoffs**: Necessary but not sufficient. Pairs well with A or B.

### Candidate D: Hybrid — A + state file + memory candidate

- **Summary**: design-ui returns `needs_human` to caller (A), persists `.claude/state/design/<slug>.json` so the orchestration is resumable on demand (B-lite, but not auto-yielding), and emits a memory candidate (C) for long-term capture. Caller policy (e.g., /tdd Step 6's "warn and continue") drives the workflow; state and memory exist for follow-up.
- **Fits**: All three concerns covered with one return contract.
- **Tradeoffs**: Largest write surface, but each file has a distinct purpose.

### Recommendation — Target 6

**Candidate D (hybrid)**. design-ui returns `{ final_state: "needs_human", ... }` to the caller, writes `.claude/state/design/<slug>.json` for resume, and emits a memory candidate. The /tdd Step 6 policy is **warn and continue**: design-ui's failure to clear P1s does not fail the /tdd phase, because /tdd's promise is "tests pass and behavior verified". Design quality is a separate dimension; surfacing it (audit report + memory candidate) is sufficient. The user can re-invoke design-ui later (resume from state) or call /impeccable directly.

A `/document` phase or a future `/design-review` step can re-trigger design-ui if the unaddressed P1s become blocking for ship.

**What would flip the recommendation**: if the project decided design P1s should block /integrate or /grant-commit, the policy in /tdd Step 6 flips to "fail" or "yield". That's a constitutional-level decision (probably an Article X.3) and is out of scope here.

---

## Synthesis — recommended approach across all six targets

| Target | Recommendation |
|---|---|
| 1. Enforcement location | **Hybrid (Candidate E)** — new dedicated hook `.claude/hooks/spec_design_calls_guard.sh` at the write boundary, paired with a new `check_design_calls` function in `.claude/skills/spec-lint/lint.sh` for preflight feedback. Mirrors the existing `plantuml_syntax_guard ↔ check_syntax` and `spec_diagram_presence_guard ↔ check_presence` patterns. |
| 2. `tdd.ui_globs` default | **Sensible stack-neutral default (Candidate B)** — ship pristine with a curated list covering React/Next.js, Vue/Nuxt, Svelte, Eleventy, and universal CSS. `/init-project` re-tailors per detected stack. Backend-only projects get a no-op rule. |
| 3. Stage 0 classification | **Keyword table + target_files heuristic (Candidate B)** — intent keyword table in `references/intent-table.md` is the primary classifier; target_files breaks ties. Deterministic, testable, AC-1/2/3 stay binary. |
| 4. Intent table location | **External `references/intent-table.md` (Candidate B)** — SKILL.md has a 3-row hot-path summary plus a pointer. Full ~18-row table in the references file. Matches `impeccable`'s `reference/<cmd>.md` precedent. |
| 5. `## Design calls` placement | **Top-level section after `## Design` (Candidate A)** — added unconditionally to `project.json → artifacts.required_sections.spec`. Empty body allowed (`*(none)*`) when no UI files in write_set. The new hook (Target 1) checks non-empty body conditionally. |
| 6. Loop cap behavior | **Hybrid (Candidate D)** — design-ui returns `needs_human` to caller, persists state at `.claude/state/design/<slug>.json`, emits memory candidate via memory_stop. /tdd Step 6 policy = warn and continue. /tdd does not fail; the design issue is surfaced for follow-up. |

**Aggregate impact on the file count from scout's surface summary**:
- +1 hook (`spec_design_calls_guard.sh`) — Target 1
- +1 audit-baseline check row + 1 settings.json wiring entry — Target 1
- +1 line in `src/project.template.json → tdd.ui_globs` (the default array) — Target 2
- +1 section in spec template, +1 line in `project.json → artifacts.required_sections.spec` — Target 5
- +0 net new files beyond what scout already enumerated.

Total touched-file estimate stays at ~15 files. Total new files = 1 hook + 4 reference docs + 4 test files = 9 net-new. Solo `/tdd` remains correct (1 logical component).

---

## Open questions

None block `/spec`. All six targets resolved with concrete recommendations grounded in the project's existing patterns. The spec author can either accept the synthesis verbatim or override per-target with their own reasoning.

One latent question worth flagging for the spec author: **the `task_brief` schema**. The intake names the fields (intent, slug, target_files, write_set, register_override, references) but doesn't specify the JSON Schema. The spec phase should formalize this — design-ui's input contract is part of its API. Recommend: include a JSON Schema fragment in the spec's `## Contracts` table, matching how the existing spec template documents endpoints.
