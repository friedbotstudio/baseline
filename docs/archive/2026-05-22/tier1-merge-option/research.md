# Pattern Research — tier1-merge-option

This memo evaluates **four internal-architecture dimensions** for replacing the tier-1 "Show diff" option with "Merge". Per the caller's brief, no library APIs are in play; `context7` is intentionally not invoked. Decisions land at `/spec`.

The four dimensions:

1. **Stage-manifest schema** for BASE-less entries.
2. **SessionStart nag wiring**.
3. **Action kind** for the Merge pick.
4. **Where the BASE-less branch lives** inside `/upgrade-project` SKILL.md.

---

## Dimension 1: Stage-manifest schema for BASE-less entries

Today's per-entry shape (`src/cli/upgrade-tiers.js:233-239`, verified):

```json
{
  "rel": "...",
  "base_sha256": "<64-hex>",
  "incoming_sha256": "<64-hex>",
  "local_sha256": "<64-hex>",
  "status": "PENDING"
}
```

`stage_version: 1` is in the manifest header. v0.7.0 readers — including `/upgrade-project` SKILL.md and `findPendingStage` — read `base_sha256` as a required string. Backward compat: a v0.7.0 stage manifest still needs to be readable by the v0.8.0 `/upgrade-project` skill, but a v0.8.0 stage manifest **does not** need to be readable by a v0.7.0 client (CLI versions are not mix-and-match across stages; the stage is consumed by the same project's `/upgrade-project` skill which gets upgraded in lockstep).

### Candidate 1A — `base_sha256: null` as the discriminator

- **Summary**: keep the field, drop the type requirement. `base_sha256: null` signals BASE-less.
- **Fits**: yes — minimal schema impact, no new field. Matches the JSON-null convention.
- **Tests it enables**: `tests/upgrade-tiers.test.mjs` adds a BASE-less stage fixture and asserts `m.files[0].base_sha256 === null`. `/upgrade-project` test asserts the skill reads the null discriminator.
- **Tradeoffs**:
  - PRO: smallest diff; no schema-version bump.
  - PRO: `findPendingStage` keeps working unchanged (it only reads `status` and `rel`).
  - CON: type is now `string | null` — a static-typed reader (none today) would need a union.
  - CON: `null` reads as "missing data" to a human inspecting the manifest, not "BASE-less by design". Documentation has to disambiguate.

### Candidate 1B — Explicit `base_recoverable: false` discriminator

- **Summary**: add a new field. Three-way entries omit (or set `true`); BASE-less entries set `false` and may omit `base_sha256` entirely.
- **Fits**: yes — explicit intent, no overload of an existing field.
- **Tests it enables**: same as 1A plus an absence-vs-true assertion.
- **Tradeoffs**:
  - PRO: self-documenting field name.
  - PRO: future BASE-recoverable-but-deferred case (hypothetical) has a clean third value.
  - CON: two ways to encode "three-way" (field absent vs `true`) — need a normalization rule.
  - CON: adds schema surface for a binary signal that `base_sha256: null` already carries.

### Candidate 1C — `merge_kind: "two-way" | "three-way"` enum

- **Summary**: add a per-entry discriminator that names the reconciliation strategy.
- **Fits**: partial — names the **reconciliation strategy** (consumer concern), not the **data shape** (producer concern). Couples two orthogonal things.
- **Tests it enables**: same as 1A plus a string-enum assertion.
- **Tradeoffs**:
  - PRO: most explicit at the consumer side; `/upgrade-project` reads `merge_kind` and switches the procedure.
  - CON: leaks reconciliation policy into the manifest. If two-way reconciliation later supports an optional best-guess BASE (e.g., from `git log`), the kind no longer maps cleanly.
  - CON: more characters per entry; redundant when `base_sha256` itself is already the data signal.

### Candidate 1D — Omit `base_sha256` entirely

- **Summary**: BASE-less entries write only `{rel, incoming_sha256, local_sha256, status}`. Absence of `base_sha256` is the discriminator.
- **Fits**: partial — backward compat is fine for the **shape**, but JSON consumers must distinguish "missing key" from "value: null" reliably.
- **Tests it enables**: presence/absence assertion in tests.
- **Tradeoffs**:
  - PRO: minimal byte footprint.
  - CON: `Object.hasOwn(entry, 'base_sha256')` is the discriminator — easier to misread than an explicit `null`. Defensive coding tax in `/upgrade-project`.
  - CON: a value-vs-missing schema is fragile across hand-edits.

### Recommendation for D1: **Candidate 1A** (`base_sha256: null`), with `stage_version` left at `1`.

The `null` value carries the data signal directly: "we know the file is staged, we cannot anchor a BASE." `/upgrade-project` reads `if entry.base_sha256 === null` as the BASE-less branch — a one-line discriminator. Backward compat is automatic because no v0.7.0 stage will carry `null`, so the v0.8.0 `/upgrade-project` reading a v0.7.0 stage finds string values and routes through the existing three-way path. The schema impact is one type change in the spec, no new field.

**What would flip the decision**: a future feature that introduces a third reconciliation strategy beyond two-way/three-way (e.g., "merge with user-supplied BASE"). At that point promote to 1B/1C with a schema-version bump.

---

## Dimension 2: SessionStart hook nag wiring

Today (verified at `.claude/hooks/memory_session_start.sh:185-190`): the hook's Python block appends a `_pending.md` nag conditional on (a) `pending_count > 0` AND (b) absence of `.claude/state/workflow.json`. Output is structured as `additionalContext` JSON; index portion caps at 2048 bytes (line 201); total budget ~9.5KB.

### Candidate 2A — Extend the existing Python block

- **Summary**: add a `scan_pending_stages(root)` helper at the end of the Python script that walks `.claude/state/upgrade/*/manifest.json`, counts entries with `status: PENDING`, and appends one nag line analogous to the `_pending.md` block.
- **Fits**: yes — pattern is identical to the existing nag. `scout` confirmed ~150B headroom in the index portion.
- **Tests it enables**: a `tests/memory_session_start.test.mjs` fixture seeds a fake stage dir and asserts the nag fires in the hook's stdout JSON. The existing hook has no tests, so this would be the first.
- **Tradeoffs**:
  - PRO: one hook, one place to edit, one place to debug.
  - PRO: shares the workflow-active gate (consistent debt-mode policy with the memory nag).
  - CON: the nag is for two different "pending" concepts in the same file; the second one needs clear copy to avoid confusion.
  - CON: hook file grows to ~270 lines; readability degrades slightly.

### Candidate 2B — New sibling hook `upgrade_stage_nag.sh`

- **Summary**: ship a new shell hook script, register it in `.claude/settings.json` as a second `SessionStart` entry alongside `memory_session_start.sh`.
- **Fits**: partial — adds operational surface. Article VIII counts hooks (today: 22); a 23rd needs a row in the Article VIII table AND a corresponding entry in `seed.md` and `audit-baseline` invariants.
- **Tests it enables**: same fixture-driven test, scoped to one hook.
- **Tradeoffs**:
  - PRO: single responsibility per hook.
  - PRO: easier to disable selectively (e.g., a user who doesn't want the nag can disable just this hook).
  - CON: schema impact on `settings.json`, audit-baseline, seed.md, CLAUDE.md Article VIII. **Significant work for a 30-line script.**
  - CON: two `SessionStart` hooks fire in undefined order; their outputs merge in Claude's context window. The hook spec doesn't guarantee ordering.

### Candidate 2C — Inline the scan into the same `out` builder; gate by stage-presence not workflow-presence

- **Summary**: like 2A, but the nag fires regardless of `active_workflow` state (because pending stages aren't "memory debt" — they're stable user-actionable state). Append before the closing `out = '\n'.join(lines)`.
- **Fits**: yes — same surface as 2A with a different gating policy.
- **Tests it enables**: same; plus an assertion that the nag fires **during** an active workflow too (the memory nag is suppressed; the stage nag is not).
- **Tradeoffs**:
  - PRO: stages live across sessions and workflows; the nag should be visible whenever stages exist.
  - PRO: matches user mental model ("if files are staged, remind me; I don't care if a workflow is open").
  - CON: a user mid-workflow sees two debt indicators in the SessionStart context (workflow continuation + pending stages); needs explicit phrasing so it doesn't read as "go run /upgrade-project NOW" when the workflow expects them to continue with `/harness`.

### Recommendation for D2: **Candidate 2C** (extend Python block, gate by stage presence not workflow presence).

The nag is stable infrastructure debt, not workflow debt. A user can have pending stages during ANY session (mid-workflow or not); the reminder helps them avoid forgetting. 2A's workflow-active gate would suppress the nag exactly when the user is most likely to be running `/harness` and could conveniently slot in a `/upgrade-project` invocation between phases.

**What would flip the decision**: a measured rate of nag fatigue (the same user dismissing the nag across N sessions without acting). Operationally not measurable today; revisit only if real users report friction.

---

## Dimension 3: Action kind for the Merge pick

Today (`src/cli/merge.js:9-22`): 12 ACTION_KINDS, including `SEMANTIC_MERGE_STAGED` (used by tier-3 SEMANTIC dispatch). The terminal label is `"staged for /upgrade-project"`. Exit-code computation routes `SEMANTIC_MERGE_STAGED → code 5`.

### Candidate 3A — Reuse `SEMANTIC_MERGE_STAGED`

- **Summary**: the Merge fallback writes a BASE-less stage entry and returns `{kind: 'SEMANTIC_MERGE_STAGED'}` — exactly the same shape as tier-3.
- **Fits**: yes — the terminal label already says what we want.
- **Tests it enables**: existing tier-3 staging tests don't need duplication; the new test asserts the kind matches.
- **Tradeoffs**:
  - PRO: zero new enum entries; zero new labels; zero new exit-code paths.
  - PRO: the user-facing report is identical for tier-3 SEMANTIC and tier-1 Merge — both say "staged for /upgrade-project". User doesn't need to learn a new category.
  - CON: the action kind no longer names a single reconciliation strategy (it now means three-way OR two-way). Internal callers reading the action stream lose precision.
  - CON: a future feature that distinguishes tier-3 from tier-1 staging in the report (e.g., "2 files staged; 1 needs structural reconciliation, 1 needs two-way merge") can't be expressed.

### Candidate 3B — Add `BASELESS_MERGE_STAGED`

- **Summary**: new enum entry, new label (`"merged into stage"`), exit-code routing still through 5.
- **Fits**: partial — adds enum surface for a state that today doesn't need to be distinguished from tier-3 in any code path except the writer.
- **Tests it enables**: separate per-tier assertions in the upgrade test suite.
- **Tradeoffs**:
  - PRO: clearer per-entry classification in the action stream.
  - PRO: future-proofs for the "show different staged-file labels" feature.
  - CON: new label, new ACTION_LABELS entry, new docs surface for a feature nobody asked for.
  - CON: violates YAGNI per the intake's non-goals.

### Candidate 3C — Add a sub-discriminator on the existing kind

- **Summary**: return `{kind: 'SEMANTIC_MERGE_STAGED', merge_kind: 'two-way'}` for the Merge pick. The kind stays unique; the sub-field carries extra precision for callers that want it.
- **Fits**: partial — adds an optional payload field, no new enum entry.
- **Tests it enables**: assertions on both fields independently.
- **Tradeoffs**:
  - PRO: backward compat for callers reading only `kind`.
  - PRO: future label-precision feature can switch on `merge_kind` without a new ACTION_KIND.
  - CON: action objects today are lean (`kind` + `path` + `reason`); adding a fourth field for a hypothetical reader is over-engineering.
  - CON: couples the action stream to the stage-manifest schema; if D1 picks 1A (`base_sha256: null`), `merge_kind` here is redundant with that.

### Recommendation for D3: **Candidate 3A** (reuse `SEMANTIC_MERGE_STAGED`).

The user-facing terminal label is already correct. Internal classification by tier is already carried in the stage manifest itself (per D1's `base_sha256: null` discriminator). Action stream consumers (only the two CLI report renderers today) don't need to distinguish — they format identically. YAGNI dominates.

**What would flip the decision**: a documentation surface (or a user-research finding) that says "users want to know which staged files are structural vs textual at CLI-report time." Until that exists, the manifest is the right place to carry the distinction.

---

## Dimension 4: Where the BASE-less branch lives inside `/upgrade-project` SKILL.md

Today's SKILL.md procedure (lines 47-58, verified): a single per-file loop that reads BASE, INCOMING, LOCAL; reasons three-way; writes reconciled bytes; marks status.

### Candidate 4A — Single per-file loop with `if base_recoverable` switch at the top

- **Summary**: keep one procedure. At the start of each per-file iteration, branch on the discriminator (per D1): three-way path reads BASE; two-way path skips BASE read and reasons over LOCAL vs INCOMING directly.
- **Fits**: yes — minimal structural change to SKILL.md.
- **Tradeoffs**:
  - PRO: one procedure, one set of constraints (path-traversal validation, NEEDS_USER_INPUT fallback, RECONCILED status update).
  - PRO: shared finalize step (stage delete when all entries reach RECONCILED).
  - CON: the per-file body is now branched; the reader has to hold two reasoning modes simultaneously.
  - CON: the zero-drift renumbering rule (the binding heart of three-way reconciliation) doesn't apply to two-way; readers may try to apply it inappropriately.

### Candidate 4B — Two parallel procedure sections

- **Summary**: SKILL.md grows a second top-level "Procedure (BASE-less)" section. Discoverable via headings.
- **Fits**: partial — clearer for a reader new to BASE-less, but the two procedures share ~80% of their constraints (NEEDS_USER_INPUT fallback, path validation, stage finalization).
- **Tradeoffs**:
  - PRO: reader knows immediately which procedure applies to each entry.
  - CON: duplication of shared constraints — drift risk over time.
  - CON: SKILL.md grows by ~40 lines for content that's largely cross-referenced.

### Candidate 4C — Top-level "Per-entry classification" section + two named sub-procedures

- **Summary**: a Classification preamble names the discriminator. Sub-procedures (Three-way reconciliation, Two-way reconciliation) are written compactly, each citing the shared Constraints section by reference.
- **Fits**: yes — DRY, with explicit branching.
- **Tradeoffs**:
  - PRO: structure mirrors the data shape: classification → procedure → finalize.
  - PRO: zero-drift renumbering rule lives only in the three-way sub-section; two-way sub-section explicitly notes "renumbering does not apply".
  - PRO: shared constraints stay in one place (no duplication).
  - CON: adds an extra navigation hop for a reader who only cares about three-way.

### Recommendation for D4: **Candidate 4C** (classification preamble + two named sub-procedures + shared Constraints).

The zero-drift renumbering rule is the most important content in the existing SKILL.md; it must not apply to two-way (no BASE means no "shift, never fold" to anchor against). Two named sub-procedures make this structural fact unambiguous to the reader (and to the LLM at invocation time). Shared constraints in one place prevent drift.

**What would flip the decision**: if /spec scopes the two-way procedure to fewer than ~5 unique constraint lines, 4A's single-loop-with-switch is fine. If two-way reconciliation grows new constraints in a future iteration (e.g., a confidence threshold), 4C scales better.

---

## Cross-cutting recommendation

Pick **1A + 2C + 3A + 4C**. The combined picture:

- **Schema (1A)**: `base_sha256: null` in the per-entry record signals BASE-less. Stage manifest version stays at 1.
- **Hook (2C)**: extend `memory_session_start.sh` Python block with a stage scan; nag fires whenever stages exist, regardless of workflow state.
- **Action kind (3A)**: reuse `SEMANTIC_MERGE_STAGED`. Per-entry tier classification stays in the stage manifest (1A).
- **Skill structure (4C)**: classification preamble + two sub-procedures sharing one Constraints section. The zero-drift renumbering rule remains binding for three-way and explicitly absent for two-way.

This minimizes new surface (no new ACTION_KIND, no new hook, no schema-version bump), preserves backward compat (v0.7.0 stages stay readable), and keeps the user-facing CLI report unchanged.

## Open questions

- **D1 verification**: does the JSON.parse round-trip preserve `null` distinctly from `undefined` in the v0.8.0 reader? (Yes — Node's JSON.parse maps `null` to `null`, `undefined` is not a JSON value. Confirmed by Node.js spec, no library cite needed.)
- **D2 ordering risk**: if a future SessionStart hook is added with stage-aware copy, the order in which they emit their `additionalContext` JSON to Claude's context is not specified by the hook spec. Today there is only one SessionStart hook; the risk is zero until a second one ships.
- **AC-005 vs AC-007 interaction**: the intake's AC-005 (re-Merge overwrites the stage entry) may be unreachable in practice because AC-007 (`findPendingStage` short-circuits) blocks the re-Merge prompt as long as the prior entry exists. `/spec` decides whether AC-005 is real or vestigial. Surface noted in the scout report.
- **Article XI manifest rebuild**: editing `.claude/skills/upgrade-project/SKILL.md` requires the Stage 1-3 inline rebuild per landmines `baseline-skill-edit-needs-manifest-rebuild`. `/simplify` Phase 7 is the natural place to land this; flag in spec as a deploy-time constraint.
