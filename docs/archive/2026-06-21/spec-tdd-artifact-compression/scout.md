# Codebase Scout Report — spec-tdd-artifact-compression

Scope: every consumer that reads the spec artifact or the tdd persisted state, so `/research` and `/spec` can decide the minimal invariant set without breaking any consumer. (Mapped via 3 parallel read-only Explore passes.)

## Primary touchpoints

### Templates (what gets authored)
- `.claude/skills/spec/template.md` — spec section order: `Context`(20) `Goal`(29) `Non-goals`(33) `Design`(37, holds all diagrams) `Design calls`(209) `Acceptance criteria`(223) `Test plan`(232) `Observability`(245) `Rollout`(253) `Rollback`(259) `Archive plan`(264) `Open questions`(272). `Design calls` table has a `Write set` column (~215). write_set is announced as **prose** in the Design-calls body (e.g. "write_set does not intersect ui_globs"), **not** a structured field.
- `.claude/skills/intake/template.md` — `Problem`(8) `Goal`(14) `Non-goals`(20) `Success metrics`(28) `Stakeholders`(34) `Constraints`(42) `Acceptance criteria`(49) `Open questions`(56).

### The hard contract — `artifact_template_guard.mjs`
- `.claude/hooks/artifact_template_guard.mjs:44` reads `projectGet('.artifacts.required_sections.${type}')` — a **flat array, zero write_set awareness**. `:58` filters missing; `:61` blocks. Normalizes headings (`:50`, lowercase/strip trailing `:`/`.`). Template files (`_TEMPLATE_*`) exempt (`:42`).
- `project.json` required_sections: **intake** = Problem, Goal, Acceptance criteria (`131-134`); **spec** = Goal, Design, Design calls, Acceptance criteria, Test plan (`141-146`). scout/research have **no** required sections (gated only on presence).
- ⚠️ **Central design tension:** making any *currently-required* section write_set-conditional REQUIRES rewriting this guard to extract write_set + consult a new `artifacts.conditional_sections.<type>` map. Otherwise the guard blocks the write regardless.

### Diagram guards
- `.claude/hooks/spec_diagram_presence_guard.mjs:40` reads `artifacts.required_diagrams.spec`; `:62-81` counts ```plantuml``` blocks per kind vs `rule.min`. **6 kinds hard-required, NO write_set gating**: c4_context, c4_container, c4_component (literal `!include <C4/...>` markers), sequence (`^\s*participant|^\s*actor`), class (`^\s*class\s+\w`), dependency_graph (`'@kind dependency-graph`). Config: `project.json:156-188`.
  - ⚠️ `:38` reads `tdd.ui_globs` but **never gates on it** — vestigial/dead read. Flag for `/research`: "gate diagrams by write_set" is a *new* capability here, not an existing toggle.
- `.claude/hooks/spec_design_calls_guard.mjs` — **the ONE write_set-conditional precedent.** `:38-39` skip if ui_globs empty; `:78-87` extract write_set from spec body via `/write[_\s]set\s*:\s*(.+)$/i`; `:44-76` brace-expand + glob-match against `tdd.ui_globs`; `:89-90` skip if no intersection; `:96-103` require ≥1 populated `## Design calls` row else block. **This is the reusable pattern** for write_set-aware gating.

### Spec-review skills (parse anchors — hard unless noted)
- `spec-diagram-review/SKILL.md` — parses inside `## Design`: `Container(`/`Component(` nesting, dependency edges `[id] --> [id]` (cycle = Critical), class `<<new>>/<<changed>>` ↔ DDL pairing, AC↔`§Behavior #N` links.
- `spec-traceability-review/SKILL.md` — parses `## Acceptance criteria` table rows `| AC-NNN | … | Upstream AC |`; traces spec AC → intake/BRD AC. Missing `Upstream AC` cell or silent intake-AC drop = Critical.
- `spec-shippability-review/check.mjs` + `analyzer.mjs` — `WRITE_SET_LINE_RE` (`check.mjs:22`) extracts `.py/.mjs/.js/.sh/.md/.json` paths from write_set; `collectShellFences` (`analyzer.mjs:35`) scans ```bash/sh/shell``` fences for dev-tree refs + unshipped imports vs `obj/template/.claude/manifest.json`. ⚠️ Only `bash|sh|shell` fence languages scanned — changing fence labels blinds C1.

### Harness + drift readers
- `harness/SKILL.md:142` — swarm-vs-solo: `grep -cE '^\s*Component\(' docs/specs/<slug>.md` ≥ `swarm.min_tasks_worth_swarming`. **`Component(` count is a hard parse anchor.**
- `harness/consolidate-open-questions.mjs:20` — extracts `^##\s+open\s+questions$` bullets from intake/research/spec (`:153-155`); filters `*(none)*`. Soft (empty if heading absent).
- `tdd/drift_check.mjs:44` `AC_ROW_RE = /^\|\s*(AC-\d+)\s*\|/gm`; `:45` `DESIGN_CALLS_SECTION_RE`; scores each AC-NNN against branch-diff added lines (`:123-132`); excludes `docs/specs/` + `docs/archive/` (`:37-38`). **AC table + Design-calls heading are hard anchors.**

### TDD persisted state (the other compression target)
- `.claude/skills/tdd/SKILL.md:56-68` writes `.claude/state/tdd/<slug>.json`:
  ```
  { slug, recipe[{name,covers,assertion,fixtures}], out_of_scope[],
    contract{ failing_test_paths[], write_set[], behavior_excerpts[], project_conventions{test_cmd,lint_cmd} },
    design_calls_rows[] }
  ```
  - **Load-bearing (keep):** slug, recipe[].name/covers/assertion, contract.failing_test_paths, contract.write_set, project_conventions.
  - **Bulky (compression targets):** `behavior_excerpts[]` (verbatim copy of spec §Behavior sequences — ~10KB for a 13-AC spec, the single biggest sink), `recipe[]` verbose assertions, `out_of_scope[]`, `design_calls_rows[]`.

## Entry points that reach this code
- PreToolUse/Write hooks fire on every `docs/specs/**` and `docs/intake/**` write: artifact_template_guard, spec_diagram_presence_guard, spec_design_calls_guard, plantuml_syntax_guard.
- `/spec`, `/tdd`, `/harness`, the 3 spec-review skills (run at the spec→approve seam), `/integrate`'s drift_check tick.

## Existing tests (must stay green)
- `tests/spec-lint-design-calls.test.mjs` — spec_design_calls_guard write_set∩ui_globs gating (the precedent's test harness — model new gating tests on this).
- `tests/drift-check-working-tree-diff.test.mjs` — drift_check AC scoring vs diff.
- `tests/spec-codesign-off-regression.test.mjs` — byte-identical spec when a feature flag is off (the **opt-out parity pattern** any compression flag should mirror).
- `tests/plantuml-syntax-guard-runtime.test.mjs` — every fence parses.
- `tests/project-json.test.mjs` — key-preservation on version refresh.
- **No dedicated artifact_template_guard test** — covered only indirectly; a write_set-aware rewrite would need a new direct test.

## Constraints and co-changes
- `project.json`: `tdd.ui_globs`(57-67), `tdd.source_globs`(25-32), `swarm.min_tasks_worth_swarming`(211), `simplify.min_files`(239), `artifacts.required_sections`(129-153), `artifacts.required_diagrams.spec`(156-188), `security.sensitive_globs`(242-249). Any new `artifacts.conditional_sections` or `*.compression` key lands here and must survive `project-json.test.mjs`.
- Guard changes ship to consumers — `obj/template/.claude/manifest.json` must list any new helper (spec-shippability-review C3 enforces this).

## Patterns in use here
write_set is currently **prose inside the Design-calls body**, not a structured field — `spec_design_calls_guard` re-derives it with a regex each time. Conditional enforcement = "read ui_globs → extract write_set → glob-match → skip-or-require." Feature flags follow an opt-out-parity contract (flag off ⇒ byte-identical to pre-feature, regression-tested). Diagram requirements are config-driven (`required_diagrams`), so widening them to be write_set-aware is a config+guard change, not a template-only change.

## Risks / landmines
- **artifact_template_guard is the gatekeeper** and is write_set-blind. The cheapest compression that avoids touching it: trim *within* sections + the tdd state file + the truly-optional spec sections — leaving the required-section *set* intact. write_set-gated *omission of required sections* is the expensive path (guard rewrite + new direct test).
- The 6 required diagrams are unconditional today; the `ui_globs` read at `spec_diagram_presence_guard.mjs:38` is vestigial — do not assume it gates anything.
- Parse anchors that look like prose but are load-bearing: `| AC-NNN |` rows, `Component(` lines, `## Design calls` heading, ```bash fences, `@kind dependency-graph` markers. Compressing the *narrative around* these is safe; altering their literal form breaks a consumer silently.
- `behavior_excerpts[]` in tdd state duplicates spec sequence text verbatim — compressing it (e.g. a spec-section pointer instead of a copy) is the highest-value, lowest-risk single target, but verify drift_check/worker ticks don't read the excerpt body directly.
