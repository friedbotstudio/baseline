# Pattern Research — brainstorm-and-codesign

This memo surfaces candidates for two design surfaces — (a) the brainstorm dialogue protocol structure, (b) `/spec` codesign-mode integration — plus resolutions for the four open questions named in the brief.

**Context7 note.** This work is entirely internal to the baseline framework: there are no third-party library APIs to verify via the `context7` MCP. The "APIs" cited are Claude Code's `Skill` and `AskUserQuestion` tools plus the in-repo patterns in `design-ui/SKILL.md`, `harness/SKILL.md`, `triage/SKILL.md`, `tdd/SKILL.md`. Treat the citations as **in-repo file:line references** rather than library API confirmations.

---

## Open question resolutions

### Q1 — Reuse vs reinvent the design-ui Stage 0 dialogue protocol

**Evidence.**
- `design-ui/SKILL.md:42-148` defines a 5-stage skill protocol: Stage 0 classify → Stage 1 capture → Stage 2 translate → Stage 3 orchestrate → Stage 4 report.
- `design-ui` returns structured `final_state` strings: `complete | needs_human | blocked | not_a_design_task | mixed_brief`.
- State checkpoints at `.claude/state/design/<slug>.json` before AND after every step (`design-ui/SKILL.md:87`).
- References split across `references/{design-vs-development,intent-table,orchestration,state-machine}.md`.

**Resolution.** The **5-stage skeleton + terminal-state vocabulary + per-step checkpoint discipline** transfers cleanly. The **specific semantics** of each stage do not: design-ui's Stage 0 routes between three lanes (design/dev/copy) using `intent-table.md` row matching; brainstorm's Stage 0 is a binary skip-check against `workflow.json → skip_brainstorm`. design-ui's Stage 2 is a single translation step to a pre-cataloged recipe; brainstorm's "translate" equivalent is multi-turn probing.

**Verdict.** Adopt the skeleton + vocabulary; specialize stage internals. Documented in candidates A and B below.

### Q2 — AskUserQuestion patterns for triage flag confirmation

**Evidence.**
- `triage/SKILL.md:50-52` already uses `AskUserQuestion` for Track confirmation (Step 5c).
- `design-ui/SKILL.md:97-101` uses prose `proceed`-prompt for multi-step recipes — not `AskUserQuestion`.
- No existing pattern for parsing `--flag` style arguments in skill prompts; triage today reads the natural-language request and asks at decision boundaries.

**Resolution.** Triage's existing confirmation pattern (`AskUserQuestion` with 2-4 options) extends naturally to a single question covering both flags when either trigger fires. Single question with 4 options: `Both` / `Skip brainstorm only` / `Codesign only` / `Neither`. Avoids two sequential dialogs which would inflate Step 5 latency.

**Caveat.** `--no-brainstorm` and `--codesign` as literal flag tokens in the request string need a deterministic parser (regex or substring match before sending to `AskUserQuestion`). Flag-present → set field, skip the question. Flag-absent + heuristic-triggered → ask.

### Q3 — Verbatim capture conventions for engineer rationale

**Evidence.**
- `.claude/memory/README.md` (memory schema) declares: entries with `source: user-instruction` or `source: user-feedback` SHALL include a `verbatim:` blockquote of the user's actual words (CLAUDE.md Article IX.6).
- Memory verbatim convention: markdown blockquote (`> the user said...`), labeled with `source:` metadata.
- No existing skill captures verbatim into a workflow artifact section (briefs, specs, etc.); the convention exists only in `.claude/memory/`.

**Resolution.** Adopt the memory-system blockquote convention inside the spec's new `## Decisions` section. Each decision entry has:

```markdown
### Decision: <name>
**Options considered:** A / B / C
**Chosen:** B
**Engineer rationale (verbatim):**
> the user's actual words

**Dismissed alternatives:**
- A — <why>
- C — <why>
```

This makes the engineer's verbatim canonical and visually distinct from Claude's prose. Tests can grep for blockquotes inside `## Decisions` to assert AC #6.

### Q4 — Stop-hook re-entry mechanics for codesign on integrate-failure

**Evidence.**
- `harness/SKILL.md` Article V decision tree exits on "needs spec change" with `harness_state: { state: "yielded", reason: "integrate failed: needs spec change" }`.
- `harness_continuation` Stop hook Path B (CLAUDE.md Article VIII, seed.md §4.1) auto-resumes after a fresh consent-gate token. Codesign re-entry has NO consent token — Path B does not fire. User must invoke `/harness` manually.
- No existing skill receives context from a previous yield; all parameter passing today happens via `workflow.json` + skill-specific state files (`.claude/state/<skill>/<slug>.json`).

**Resolution.** A new state file at `.claude/state/codesign/<slug>.json` carries decisions across the workflow lifetime. On integrate-failure-needs-spec-change:

1. `harness/SKILL.md` writes a `revisit_context` block to `.claude/state/codesign/<slug>.json` describing the failure (which AC, which behavior).
2. `harness` writes `harness_state: yielded` with reason naming the codesign revisit.
3. User invokes `/harness` to resume; harness sees `workflow.json → codesign_mode: true` AND `revisit_context` present in the codesign state file; re-invokes `/spec` with the revisit flag.
4. `/spec` reads the state file, surfaces "decision X is being revisited because of failure Y", re-runs the Stage 2 dialogue for that one decision only, updates `## Decisions`, continues.

Stop-hook Path B does not need modification — codesign re-entry is explicitly user-invoked. The state file is the carrier; no new hook plumbing.

---

## (a) Brainstorm dialogue protocol structure

### Candidate A: Mirror design-ui's 5-stage skeleton verbatim

- **Summary**: Brainstorm SKILL.md adopts Stage 0–4 vocabulary identically: Stage 0 classify (skip-check), Stage 1 capture (read inputs + gap analysis), Stage 2 translate (probe dialogue), Stage 3 orchestrate (synthesize + confirm loop), Stage 4 report (persist).
- **API references (current)**:
  - `Skill(brainstorm)` invocation pattern — `design-ui/SKILL.md:1-5,42-148` (5-stage skeleton + final_state vocabulary)
  - `AskUserQuestion` tool semantics — `triage/SKILL.md:50-52` (single-question + options + multiSelect modes)
  - State checkpoint shape — `design-ui/SKILL.md:87` (`.claude/state/<skill>/<slug>.json` with `{slug, started_at, intent, state, step_index, ...}`)
- **Fits**: Yes — Scout's "Patterns in use here" section names design-ui's staging as the closest precedent. Vocabulary parity reduces cognitive load for future skill authors.
- **Tests it enables**:
  - Stage 0 skip-fast-path test (asserts no AskUserQuestion fires when `skip_brainstorm: true`)
  - Stage 2 dialogue discipline test (asserts no solution-shaped tokens in any Stage 2 turn — AC #3)
  - Terminal state assertion (`final_state` values: `complete` | `needs_human` | `skipped`)
- **Tradeoffs**: Forces all five stages even when some are trivial (Stage 2 "translate" maps to a multi-turn dialogue, not a recipe lookup — the stage name carries semantic mismatch). Adds ceremony to a skill that could be linear.

### Candidate B: Specialized 4-stage protocol (skip-check, gap-analysis, probe, persist)

- **Summary**: Drop Stage 2 "translate" entirely; brainstorm has no recipe to look up. Four stages: Stage 0 skip-check → Stage 1 gap-analysis → Stage 2 probe-dialogue → Stage 3 confirm-and-persist. Keep design-ui's terminal-state vocabulary (`complete | needs_human | skipped`).
- **API references (current)**:
  - 4-stage variant inferred from design-ui by dropping the translation step; no direct precedent in the baseline
  - `AskUserQuestion` per probe round — `triage/SKILL.md:50-52`
  - State file at `.claude/state/brainstorm/<slug>.json` — pattern from `tdd/SKILL.md:52-68`, `design-ui/SKILL.md:87`
- **Fits**: Yes — fits the actual brainstorm semantics without forcing a name mismatch on Stage 2. State file shape stays consistent with other skills.
- **Tests it enables**: Same as Candidate A.
- **Tradeoffs**: Diverges from design-ui's 5-stage convention by one stage. Future reader sees "why does this skill have 4 stages when design-ui has 5?" and must read the rationale.

### Candidate C: Linear protocol with no explicit stages

- **Summary**: Skill SKILL.md describes a linear sequence — read request, identify gaps, ask N targeted questions, summarize, confirm, persist — without partitioning into named stages. Closer to the current intake skill's free-form Step list (`intake/SKILL.md:22-31`).
- **API references (current)**:
  - Linear-step pattern — `intake/SKILL.md:22-31`, `scout/SKILL.md`, `research/SKILL.md`
- **Fits**: Yes — consistent with non-staged baseline skills.
- **Tests it enables**: Discipline test (solution-shape token scan) still works; terminal-state vocabulary degrades to ad-hoc strings unless explicitly added.
- **Tradeoffs**: No structural skip-fast-path; the skill body must early-return when `skip_brainstorm: true`. Loses the testable boundary between "probe" and "synthesize" that staged protocols give. Iteration cap (5 confirm-cycles per intake AC) becomes a soft convention rather than a stage-boundary check.

### Recommendation for (a)

**Candidate B** (specialized 4-stage). Adopts design-ui's discipline (staged protocol, terminal-state vocabulary, per-step checkpoint) without forcing a Stage 2 name mismatch. The skip-fast-path lives at Stage 0 (structurally testable per AC #2), the dialogue discipline lives at Stage 2 (structurally testable per AC #3), the iteration cap lives at the Stage 2 → Stage 3 boundary (structurally testable per the 5-revisit cap).

**Flip condition.** If `/research` consumers (downstream skill authors) report cognitive friction from the 4-vs-5 stage mismatch with design-ui, fall back to Candidate A and rename Stage 2 from "translate" to "probe" inline (documented exception to the design-ui vocabulary).

---

## (b) Codesign-mode integration into `/spec` drafting

### Candidate D: Pre-drafting decision phase (Step 1.5 inside `/spec`)

- **Summary**: `/spec` reads `workflow.json → codesign_mode` at the top of Step 1. When true, runs a pre-drafting decision-capture phase (Steps 1.5.1–1.5.5: identify decision points → propose+rationale per point → AskUserQuestion approve/alternative → capture verbatim → populate `## Decisions` section). Then continues Step 2 (read template, draft diagrams) using the decided approach.
- **API references (current)**:
  - `/spec` step structure — `spec/SKILL.md:27-39`
  - `## Decisions` section placement — new addition to `spec/template.md`; pattern modeled on existing `## Design calls` section structure
  - Verbatim capture convention — Q3 resolution above
- **Fits**: Yes — preserves the existing `/spec` step ordering; inserts a single conditional block. Existing tests for `/spec` (template guard, design-calls guard, lint) continue to pass unchanged on `codesign_mode: false` runs.
- **Tests it enables**:
  - `codesign_mode: false` path is byte-identical to today's `/spec` (regression test)
  - `codesign_mode: true` path produces `## Decisions` section with N entries (AC #5)
  - Engineer verbatim blockquote presence test (AC #6)
- **Tradeoffs**: All decisions are made up-front before any diagram is drawn. If a decision turns out to be wrong only after the C4 / sequence / dependency diagrams are partially drafted, the user must restart the codesign dialogue — there's no mid-draft revisit. Mitigated by the Q4 re-entry mechanic (post-integrate revisit), but a mid-`/spec`-session revisit is not supported.

### Candidate E: Inline codesign — decisions asked mid-drafting

- **Summary**: `/spec` drafts diagrams in order (C4 Context → Container → Component → sequence per AC → dependency graph). For each load-bearing decision encountered during drafting, pause and ask the engineer. Decisions populate `## Decisions` in arrival order.
- **API references (current)**:
  - `/spec` step structure — `spec/SKILL.md:27-39`
  - No existing precedent for mid-drafting `AskUserQuestion` in any baseline skill
- **Fits**: Partially — closer to a natural human-engineer conversation, but breaks the existing draft-then-verify model.
- **Tests it enables**: Decision-arrival-order test (`## Decisions` entries appear in spec authoring order). Harder to test deterministically because the order depends on free-form drafting flow.
- **Tradeoffs**: Diagram drafting becomes interactive — long sessions, harder to resume. Inverts /spec's current invariant (Steps 3-5 of `spec/SKILL.md` say "draft each diagram first, then surrounding prose"; mid-draft pauses break the "draft each diagram first" guarantee). Higher implementation complexity; harder to compose with `/spec-lint` and the diagram guards.

### Candidate F: Separate `/codesign` skill before `/spec`

- **Summary**: Add a new Phase 3.5 `/codesign` skill that runs between `/research` and `/spec`. Output: `docs/codesign/<slug>.md` with the `## Decisions` section. `/spec` reads it as an input (like it reads `/research`'s memo today).
- **API references (current)**:
  - Separate-skill pattern — every existing phase skill
- **Fits**: Architecturally cleaner separation (codesign = engineer dialogue, spec = blueprint). But the user explicitly rejected this in pre-triage conversation, choosing unification into `/spec`.
- **Tests it enables**: Same as Candidate D, plus phase-ordering tests (track_guard enforces).
- **Tradeoffs**: Adds a workflow phase (changes Article IV phase table). Adds a separate artifact bundle entry for `/archive`. Adds a new state file. Adds triage logic to decide when codesign fires. **Already dismissed** by the user during pre-triage architectural conversation; included here for completeness and as the flip-back candidate.

### Recommendation for (b)

**Candidate D** (pre-drafting decision phase inside `/spec`). Honors the user's unification decision from pre-triage conversation, preserves the existing `/spec` draft-then-verify invariant, makes the `codesign_mode: false` path byte-identical to today's behavior (low regression risk), and concentrates all new code in a single skill.

**Flip condition.** If the engineer feedback after first production use is "I want to revisit decisions mid-draft, not just after integrate-failure," consider migrating to Candidate E. Migration is non-trivial but localized to `/spec`.

---

## Recommendation summary

| Surface | Recommendation | Rationale |
|---|---|---|
| Brainstorm protocol (a) | Candidate B — 4-stage specialized | Discipline + checkpoints + testable boundaries; honest semantic fit |
| `/spec` codesign mode (b) | Candidate D — pre-drafting Step 1.5 | Preserves existing `/spec` invariants; low regression risk |
| Triage flag confirmation (Q2) | Single 4-option AskUserQuestion | Avoids dialog sequencing |
| Engineer verbatim (Q3) | Markdown blockquote inside `## Decisions` | Consistent with `.claude/memory/` verbatim convention |
| Re-entry mechanics (Q4) | `.claude/state/codesign/<slug>.json` carries `revisit_context` | No Stop-hook plumbing needed |

## Open questions

These remain for the human reviewer to decide at `/spec`:

- **Does `artifact_template_guard.mjs` extend to watch `docs/brief/<slug>.md`?** (Scout's open Constraint.) Default-leave-unguarded is simpler; default-extend requires `src/project.template.json:109-145` to gain a `brief` row and the hook to gain a 5th `else if` branch. Spec author decides.
- **Where does the codesign 3-revisit cap live?** Hardcoded constant in `/spec` SKILL.md (matches design-ui's hardcoded 3-iteration cap at `orchestration.md`) or `project.json` knob (parallel to `swarm.min_tasks_worth_swarming`)? Default to hardcoded unless a project-level override is foreseeable.
- **Does `/triage`'s heuristic detection of `codesign_mode: true` use a fixed keyword list (`computer vision`, `model architecture`, `numerical`, `cryptographic`, `consensus`, `realtime`, `kernel`) or an LLM classifier turn?** Fixed list is deterministic and testable; LLM turn is more flexible but adds non-determinism to triage. Default to fixed list.
- **When `/intake` is re-invoked on an existing workflow (`workflow.json → completed` already contains `"intake"`), should brainstorm re-fire or short-circuit to read the existing `docs/brief/<slug>.md`?** Intake skill's idempotency contract today (read template, overwrite output) suggests re-fire; brainstorm convention suggests short-circuit. Spec author decides.
- **Does the brainstorm state file (`.claude/state/brainstorm/<slug>.json`) get archived alongside `docs/brief/<slug>.md`?** Currently `archive.sh:54-63` archives docs/* and a subset of `.claude/state/` (spec_approvals, swarm). The brainstorm state file is in-flight scratch; default to "no, scratch only," but spec author decides.
- **Does `/research` auto-flag `codesign_recommended: true` modify `workflow.json` directly, or surface a recommendation in the research memo for the user to act on at `/triage` re-entry?** Direct modification is simpler but violates the "decisions live in main context" principle (research would be auto-changing flow state). Recommend memo-only; user opts in via subsequent `/triage --codesign` or by editing workflow.json explicitly.
