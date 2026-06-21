# Pattern Research — spec-tdd-artifact-compression

Goal: cut output tokens **and** wall-clock on `/spec` (≈97k out) and `/tdd` (≈89k out) without regressing any consumer the scout mapped. This is internal harness tooling — **no third-party library is in the compression path** (sole dep `@clack/prompts@1.4.0` is CLI-only), so **context7 is N/A**; no external API is asserted below.

**Scout correction confirmed:** `spec_diagram_presence_guard.mjs` reads no `ui_globs` — diagram requirements are unconditional, config-driven (`artifacts.required_diagrams.spec`). write_set-gated diagrams is a *new* capability, not an existing toggle.

**Where the tokens actually live (decides candidate value):**
- `/tdd` 89k → dominated by `behavior_excerpts[]` (verbatim copy of spec sequences, ~10KB/large spec) + verbose `recipe[]` assertions. **Compressible with no guard change.**
- `/spec` 97k → dominated by the `## Design` diagram block (6 required PlantUML diagrams = hard anchors) + AC/Test-plan tables + narrative. **Only narrative is trimmable without a guard change; the diagram bulk needs write_set-gating.**

So no single candidate moves both numbers cheaply — the recommendation composes them.

---

## Candidate A: Structural state/pointer compression (no guard change)

- **Summary**: Replace `tdd` state `behavior_excerpts[]` verbatim copies with **pointers** (`{spec_slug, ac_id, anchor: "§Behavior #N"}`) the workers resolve by reading the spec section on demand; tighten `recipe[]`/`out_of_scope[]` to the decision-relevant minimum. Trim narrative prose *between* the spec's hard anchors via the `/spec` + `/tdd` authoring instructions (not the schema).
- **API references (current)**: none — internal `.claude/state/tdd/<slug>.json` shape + SKILL.md prose only.
- **Touches scout landmarks**: `tdd/SKILL.md:56-68` (state schema), the worker ticks + `drift_check.mjs` (must resolve pointer, not read excerpt body — `drift_check` already reads the *spec* for AC/Design-calls, so it's pointer-friendly).
- **Guard blast radius**: **zero.** No `docs/specs/**` Write-hook touched. The state file is gitignored runtime state with no structural guard reader.
- **Opt-out parity**: trivial — a `workflow.json` flag (default off ⇒ verbatim excerpts as today); regression-test mirrors `spec-codesign-off-regression.test.mjs`.
- **Tradeoffs**: Captures the **measured single biggest sink** (behavior_excerpts) + the tdd narration durably and safely. But it barely moves the **spec** 97k — the spec's diagram bulk is untouched. Risk: a worker that read the excerpt body directly would need the spec available at tick time (it is — the approved spec is on disk).

## Candidate B: write_set-gated artifact profiles (guard rewrites)

- **Summary**: Introduce `artifacts.profiles` in `project.json` keyed by write_set-glob → reduced required-section + required-diagram set. Rewrite `artifact_template_guard` and `spec_diagram_presence_guard` to extract write_set (reuse `spec_design_calls_guard.mjs:78-87` regex + `:44-76` glob-match verbatim) and consult the profile. E.g. a hook/skill/doc-only write_set (no `source_globs`/`ui_globs`/multi-layer intersection) drops `c4_context`+`c4_container` (keeps `c4_component`+`dependency_graph`+`sequence`) and trims optional sections.
- **API references (current)**: none — extends existing guards + `project.json`.
- **Touches scout landmarks**: `artifact_template_guard.mjs:44-61`, `spec_diagram_presence_guard.mjs:40-81`, `project.json:141-188`. Models gating on `spec_design_calls_guard` + `tests/spec-lint-design-calls.test.mjs`.
- **Guard blast radius**: **highest.** Two guard rewrites + two new direct tests (artifact_template_guard currently has *no* direct test — must add one). Every spec write re-routes through write_set extraction.
- **Opt-out parity**: achievable — a default `full` profile = today's required sets, regression-tested byte-identical when no profile matches. The danger is a *mis-scoped* profile silently dropping a diagram a reviewer needed (violates intake non-goal "no blanket removal" / AC2 "zero downstream regression").
- **Tradeoffs**: **Highest ceiling** — the only candidate that durably cuts the spec's 97k diagram bulk, and directly satisfies intake AC4 ("diagram/verbosity gated down per write_set relevance"). But it's exactly the "load-bearing on the harness" risk the intake flags: two guards that gate every spec, with a fidelity-regression failure mode.

## Candidate C: Authoring-instruction + live-reasoning trimming (behavioral, the stretch)

- **Summary**: Change only `/spec` + `/tdd` SKILL.md authoring guidance to emit the minimal decision-relevant content (terser ACs, no restated rationale, pointer-not-copy) **and** the in-scope stretch: a guardrail that bounds model narration/verbosity during generation. No schema, no template, no guard change — a `workflow.json` flag the SKILLs read.
- **API references (current)**: none.
- **Touches scout landmarks**: `spec/SKILL.md`, `tdd/SKILL.md` authoring steps only.
- **Guard blast radius**: **zero.**
- **Opt-out parity**: trivial (flag default off ⇒ byte-identical authoring).
- **Tradeoffs**: Cheapest, fully reversible, and the only path to the live-reasoning stretch. But **weakest enforcement** — a behavioral nudge with no structural guarantee; the model can regress to verbosity, and "narration" has no mechanical oracle (intake open-question 4). Per `docs/references/token-efficiency.md` this is the alias-drift-risk axis, so its guardrail must be conservative.

---

## Recommendation

**Primary: A (spine) + a narrow, well-tested slice of B (diagrams only) + C's authoring trim; defer B's required-*section* rewrite.**

Rationale:
- **A** captures the measured biggest single sink (tdd `behavior_excerpts`) at zero guard risk — it is the brief's stated highest-value/lowest-risk target and should anchor the work.
- The spec's 97k is mostly diagrams, which **only B can touch** — and intake **AC4 already requires** write_set-gated diagram reduction, so a slice of B is in-scope by the approved criteria, not scope creep. Scope it to **`spec_diagram_presence_guard` only**, reusing `spec_design_calls_guard`'s proven extraction, with a default `full` profile preserving opt-out parity and a direct test.
- **Defer the `artifact_template_guard` required-*section* rewrite** (B's other half): it has no existing test, smaller payoff than diagrams (sections are cheaper than PlantUML blocks), and the highest fidelity-regression risk. Trimming *optional* sections + within-section narrative (A/C) gets most of the section win without rewriting the section gatekeeper.
- **C's narration trimming** rides as the flagged stretch (AC6), conservative by default.

**What would flip it:** if `/spec` decides the spec-side ceiling matters more than bounded risk, promote full-B (both guard rewrites) — but that likely warrants its own slice/spec given the harness blast radius. If measurement (open question below) shows the tdd side alone already hits the cost+latency target, drop B entirely and ship A+C.

## Open questions (for the human at /spec)

1. **Diagram profile scoping** — which exact diagram kinds are safe to drop for a hook/skill/doc-only write_set? `c4_component`+`dependency_graph` clearly stay; is dropping `c4_context`/`c4_container` acceptable for non-architectural changes, or does the reviewer want them always? (Drives B-narrow's profile table.)
2. **Measurement method for AC1** — a clean before/after needs a fixed reference change to A/B the same workflow against, with `timing.md` token columns. Define the reference change in the spec's Test plan, or AC1 stays unfalsifiable.
3. **Pointer resolution safety (A)** — confirm no `tdd` worker tick reads `behavior_excerpts[]` body as anything other than context the approved spec already provides. If one does, A needs that tick to read the spec section instead.
4. **Narration guardrail (C/AC6)** — is the stretch's guardrail mechanical (a post-generation token-delta check that flags regression) or advisory-only? Per the token-efficiency reference, advisory-only is acceptable for the live-reasoning axis since a mechanical oracle for "narration" is unproven.
