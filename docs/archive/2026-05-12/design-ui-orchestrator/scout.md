# Codebase Scout Report — design-ui-orchestrator

## Primary touchpoints

### The skill being rewritten

- `.claude/skills/design-ui/SKILL.md:1-105` — current shape. Frontmatter description claims it "writes code; it does not pick aesthetic direction." Mandatory first step (`SKILL.md:10-15`) invokes `impeccable` **only to load context** (`PRODUCT.md` / `DESIGN.md`), explicitly not to re-pick register. Has detailed sections for required inputs (`:16-31`), 7-step method (`:32-48`), output template (`:50-91`), and constraints (`:93-105`). To be wholesale rewritten as an orchestrator. No reference files or scripts under this directory today (`.claude/skills/design-ui/` contains only `SKILL.md`).

### The skill it orchestrates

- `.claude/skills/impeccable/SKILL.md` — vendored Apache 2.0. 20+ subcommands organized in 5 categories: Build (`craft`, `shape`, `teach`, `document`, `extract`), Evaluate (`critique`, `audit`), Refine (`polish`, `bolder`, `quieter`, `distill`, `harden`, `onboard`), Enhance (`animate`, `colorize`, `typeset`, `layout`, `delight`, `overdrive`), Fix (`clarify`, `adapt`, `optimize`), Iterate (`live`). Routing rules at the bottom of the file: first word matches → load `reference/<cmd>.md`. Stays untouched per CLAUDE.md Art. IX vendoring discipline.
- `.claude/skills/impeccable/reference/{craft,shape,polish,audit,delight,teach,...}.md` — per-subcommand instruction files; design-ui's translation table references command names verbatim from this directory.

### The phase that will call it

- `.claude/skills/tdd/SKILL.md:1-76` — current step structure (lines `:24-69`):
  1. Verify prereq
  2. Decide the scenario recipe (in main context)
  3. Invoke `scenario`
  4. Decide the implementation contract (in main context)
  5. Invoke `implement`
  6. Invoke `verify`
  7. Decide on the result
- The new design-ui step plugs in **after step 6 (verify) and before step 7 (decide)**. Re-verify is needed after design-ui to confirm UI changes did not regress behavior tests. So the new flow becomes 6 → design-ui → re-verify → 7, or renumber 7 → "Invoke design-ui (when applicable)", 8 → "Re-invoke verify", 9 → "Decide on the result". `/research` chooses the numbering.

### The spec layer (adds the `design_calls[]` declaration)

- `.claude/skills/spec/SKILL.md:1-69` — produces `docs/specs/<slug>.md`. Required sections in `project.json → artifacts.required_sections.spec` are currently `["Goal", "Design", "Acceptance criteria", "Test plan"]`. A new section is needed for design calls; candidates: add `"Design calls"` to required_sections (unconditional), OR add a conditional rule (only required when `write_set` intersects `tdd.ui_globs`).
- `.claude/skills/spec/template.md:1-261` — canonical skeleton. The new `## Design calls` section belongs after `## Design` and before `## Acceptance criteria` (matches the data-flows-into-tests order). Template fragment shape similar to the existing `## Contracts` table: one row per design call with intent, target_files, write_set, references.

### The enforcement layer

- `.claude/skills/spec-lint/lint.sh:1-137` — preflight script. Three current check functions: `check_syntax` (`:37-56`), `check_presence` (`:58-81`), `check_traceability` (`:83-118`). Pattern is `(status, detail)` tuple returned; results assembled into a table. A new `check_design_calls(spec_text, project_json, ui_globs)` function plugs in alongside (`:120-124`).
- `.claude/hooks/spec_diagram_presence_guard.sh:1-142` — write-boundary enforcer for spec diagram kinds. Reads `project.json → artifacts.required_diagrams.spec`. **NOT the right place** for `design_calls[]` enforcement — concern mismatch (diagrams vs sections).
- `.claude/hooks/artifact_template_guard.sh:1-29` (head, full file ~150 lines) — write-boundary enforcer for required `##` headings per artifact type. Reads `project.json → artifacts.required_sections.<type>`. **Possible home** for `design_calls[]` enforcement: extend the required-sections list conditionally. Tradeoff: the hook would need to parse the spec body to detect write_set / ui_globs intersection. Otherwise: add a new dedicated hook `spec_design_calls_guard.sh`. `/research` picks the cleanest split.

### The audit layer (drift defender)

- `.claude/skills/audit-baseline/audit.sh:1-60` (head; full file ~1000+ lines) — Python embedded in bash, single ROOT env var, results list of `(name, status, detail)` rows. EXPECTED_HOOKS set has 20 entries (`:25-39`); EXPECTED_SKILLS set has the full 36 including `design-ui` (`:41-66`). New audit checks plug into the existing categories: (a) `project.json: tdd.ui_globs` presence, (b) `CLAUDE.md: Article X.2 present`, (c) `src/CLAUDE.template.md: Article X.2 mirrors`, (d) `design-ui SKILL.md surface matches new role`.

### The config surface (where `tdd.ui_globs` lands)

- `.claude/project.json` — live config. The `tdd` object today (lines paraphrased): `enabled`, `source_globs`, `test_globs`, `mapping`, `exempt_globs`. New sibling field: `ui_globs` (array of glob patterns). Live project's source_globs already include `.claude/skills/**` and `.claude/hooks/**` — both relevant for the work itself (the work touches skills + hooks).
- `src/project.template.json` — pristine version. `configured: false`. Its `tdd` block uses generic stack-neutral defaults (`src/**`, `lib/**`, `app/**`, `pkg/**`, `internal/**`). The pristine `ui_globs` value is one of the open questions in the intake — `/research` decides whether to ship a default list or leave empty for `/init-project` to populate.

### The constitutional surface (Article X.2)

- `CLAUDE.md:214-260` — Article X. Currently contains the boundary line + Article X.1 (Copy register and skill overrides) added in the last session. X.2 follows the same heading style (`### X.2 <name>`) directly after X.1.
- `src/CLAUDE.template.md` — must mirror live `CLAUDE.md` per `tests/template-drift.test.mjs`. Drift breaks the test. Any X.2 edit lands in both files in the same change.

### The genesis surface (seed.md §4)

- `docs/init/seed.md:212` — design-ui's current §4.3 entry: *"implements a frontend surface against a pre-decided design call (mandatorily `impeccable` to confirm context coherence — not to re-pick register). Used when a phase requires a UI surface implemented."* Needs to update to reflect orchestrator role.
- `docs/init/seed.md:235` — impeccable's current §4.3 entry: *"production-grade frontend interface design… Invoked by `design-ui` to confirm context coherence — register/palette decisions live in main context, not inside the worker skill."* The "to confirm context coherence" wording also needs updating since design-ui will now invoke impeccable for the full set of design moves, not just context loading.
- `src/seed.template.md` — pristine; mirrors live with the §16 reservation. Drift handled by audit-baseline (`src templates: seed.template.md` row checks §16 is reserved, not populated).

## Entry points that reach this code

- `/tdd` slash command (workflow phase 6) → invokes `tdd` skill → currently has no design-ui step. After this work, `tdd` step 6.5 (or 7) invokes `design-ui` per declared `design_calls[]`.
- `/chore` slash command (alternate track) → can conditionally invoke `design-ui` when chore diff touches UI files. Out of scope for v1.
- Direct user invocation `/design-ui` → currently undocumented entry point; will become the canonical user-facing entry after the refactor.
- `Skill(design-ui, …)` programmatic invocation → from `/tdd` orchestrator step 6 (new).

## Existing tests

| Test path | What it covers | Status |
|---|---|---|
| `tests/template-drift.test.mjs` | Byte-for-byte mirror of live `CLAUDE.md` ↔ `src/CLAUDE.template.md`. Article X.2 lands in both files. | passing — must continue passing after edit |
| `tests/template-payload.test.mjs` | The npm-shipped `template/` allowlist (only baseline product). New `.claude/skills/design-ui/references/` files must be allowed; they fall under `.claude/skills/` which is already in the allowlist. | passing — no edit needed |
| `tests/build-audit-gate.test.mjs` | Build aborts when audit fails. The new audit checks (Art. X.2, ui_globs, design-ui surface) must pass for the build to succeed. | passing — must continue passing |
| `tests/build-template.test.mjs` | End-to-end build of `template/`, plus an idempotency check. | passing — no edit needed |
| `tests/render-swarm-worker.test.mjs` | The `{{NAME}}` etc. token substitution for swarm-worker. | unrelated |
| `tests/{cli,conflict,install,merge,doctor,manifest,mcp,plantuml,io,util,npm-pack-tarball}.test.mjs` | The `create-baseline` CLI surface. | unrelated |

New tests to add:
- `tests/design-ui-classification.test.mjs` — AC-1, AC-2, AC-3 (Stage 0 classification + Stage 2 single/multi-step recipe).
- `tests/design-ui-orchestration.test.mjs` — AC-6, AC-7 (loop cap, state persistence).
- `tests/spec-lint-design-calls.test.mjs` — AC-4 (rejection of UI-touching specs without `design_calls[]`).
- `tests/tdd-step-6.test.mjs` — AC-5 (`/tdd` invokes design-ui once per declared design call when implement's write_set intersects ui_globs).

## Constraints and co-changes

- **CLAUDE.md ↔ src/CLAUDE.template.md mirror** — `tests/template-drift.test.mjs` is the enforcer. Article X.2 lands in both files atomically; otherwise the test fails.
- **audit-baseline drift check passes** — new checks for (a) `project.json: tdd.ui_globs`, (b) Article X.2 presence, (c) design-ui SKILL.md surface match the new orchestrator role. The audit's `EXPECTED_SKILLS` set already lists `design-ui`; no change there.
- **spec template + required_sections sync** — if `## Design calls` becomes a new required heading, `project.json → artifacts.required_sections.spec` adds `"Design calls"` AND `src/project.template.json → artifacts.required_sections.spec` mirrors. Otherwise the conditional rule lives in spec-lint and the new hook only.
- **`.claude/state/design/<slug>.json` path** — `.claude/state/` is gitignored as a whole (`.gitignore` excludes it). No new gitignore entry needed. Follows the convention of `.claude/state/swarm/<slug>.json` and `.claude/state/spec_approvals/<slug>.md.approval`.
- **No new hook for routing enforcement** — per the intake's non-goal, spec-lint + Article X.2 + /tdd Step 6 are the enforcement triplet. No write-boundary hook on UI files; that would be overreach.
- **Vendored impeccable stays untouched** — Art. IX vendoring discipline. All overrides live in design-ui (a first-party skill) and Article X.2 (constitutional).

## Patterns in use here

- **Skill SKILL.md structure**: frontmatter (`name`, `description`, `argument-hint?`) + body (`# Skill name`, `## Prereq`, `## Steps`, `## Constraints`). The current `design-ui/SKILL.md` follows this. The new orchestrator version preserves the same shape but rewrites the body around Stage 0/1/2/3.
- **Reference files under a skill directory**: `.claude/skills/impeccable/reference/<cmd>.md` is the precedent for the four new reference files we'll add under `.claude/skills/design-ui/references/`. (Note: impeccable uses `reference/` singular; we'll mirror that path name.)
- **Helper scripts under a skill directory**: `validate.sh` (swarm-plan), `swarm_merge.sh` (swarm-dispatch), `render.sh` (spec-render), `lint.sh` (spec-lint), `archive.sh` (archive), `audit.sh` (audit-baseline). Design-ui likely needs none in v1 (the orchestration is pure Skill invocation), but the convention is there if a helper becomes useful later.
- **Audit row format**: `(name, status, detail)` rows printed in a table with name-width auto-padding; overall status is `FAIL if any fails else PASS`; exit code mirrors the status. New audit checks follow this shape.
- **State file naming**: `.claude/state/<subsystem>/<slug>.<ext>` — `swarm/<slug>.json`, `spec_approvals/<slug>.md.approval`, `harness/<slug>.log`. `design/<slug>.json` is consistent.
- **Article X.N numbering**: `## Article X — Project-specific rules` header + `### X.<N> <name>` subsections separated by horizontal rules. X.1 is the precedent; X.2 follows the same pattern.

## Risks / landmines

- **`conventions.md → dev-server-ownership`** (verified 2026-04-30) — every skill running a dev server (impeccable live, integrate smoke, design-ui playwright verification) MUST follow the named-PID kill rule, not `lsof -ti:PORT | xargs kill`. Cross-references `landmines.md → lsof-port-kill-takes-firefox-with-it`. Verified entry; binding for any new orchestration code that boots a dev server. The new design-ui delegates dev-server lifecycle to `impeccable live` so the rule applies transitively.
- **`landmines.md → lsof-port-kill-takes-firefox-with-it`** (verified 2026-04-30, incident-sourced) — same surface; the firefox-killing pattern bit during a prior session. The new design-ui state machine must not introduce a competing dev-server-kill code path.
- **`pending-questions.md → Q-002`** (open since 2026-04-29) — the prior `site-react-ssg-seo` rebuild surfaced the "design-ui interaction model is too thin" pain point: the user had to give design calls main context could not derive from DESIGN.md alone. This refactor addresses Q-002's structural framing (design-ui as orchestrator gives a clear surface for repeated `/design-ui` passes), but does NOT resolve Q-002's specific content question about that rebuild. Q-002 is not blocking this work; the work indirectly reduces the friction Q-002 documented.
- **`decisions.md → subagents-vs-skills`** (verified) — historical decision that design-ui is a *skill* not a subagent because UI design requires conversational nuance (screenshots, offhand "I hate that purple", prior rounds). This refactor preserves the decision: design-ui still runs in main context as a skill; impeccable also in main context. No subagent introduced.
- **Empty `.claude/skills/design-ui/` directory today** — only `SKILL.md` is present. The 4 new files under `references/` are net-new; the existing `SKILL.md` is fully replaced (not edited in place). No existing references/scripts to coordinate with.
- **Zero current callers of `Skill(design-ui)` or `/design-ui`** — confirmed via grep. The intake's claim holds. This means the refactor has no backward-compat surface to preserve; clean break is acceptable. Past use (Q-002 conversation) was via direct user invocation and is irrelevant to the new contract.
- **Test count baseline = 84 passing** — verified at session start. Any new test file in `tests/` runs via the existing `npm test` (which globs `tests/*.test.mjs`). No `package.json` change needed.

## Surface count summary

- **Files to create new**: 4 (`.claude/skills/design-ui/references/{intent-table,design-vs-development,orchestration,state-machine}.md`) + 4 test files = 8 net-new files.
- **Files to rewrite wholesale**: 1 (`.claude/skills/design-ui/SKILL.md`).
- **Files to edit additively**: ~9 — `.claude/skills/tdd/SKILL.md`, `.claude/skills/spec/SKILL.md`, `.claude/skills/spec/template.md`, `.claude/skills/spec-lint/lint.sh`, `.claude/skills/audit-baseline/audit.sh`, `.claude/project.json`, `src/project.template.json`, `CLAUDE.md`, `src/CLAUDE.template.md`, `docs/init/seed.md`, `src/seed.template.md`.
- **Optional new file**: `.claude/hooks/spec_design_calls_guard.sh` if `/research` picks the dedicated-hook path over extending `artifact_template_guard.sh`.
- **Total touched**: ~14–15 files. Well under the swarm threshold (`swarm.min_tasks_worth_swarming: 3` measures C4 *Components*, not file count; this work has 1 logical component — the design-ui orchestrator — so solo `/tdd` is the right path per Pillar 3 of `/harness`).
