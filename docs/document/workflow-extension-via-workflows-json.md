# Documentation plan — `.claude/workflows.jsonl` track extension

<!--
Workflow Phase 10 planning artifact. Surveys the diff, identifies every
project-doc + website surface whose claims go stale, drafts the replacement
copy, runs humanizer on the user-facing blocks, and hands off the visual
rework items to design-ui.

This is a planning document, not a final user-facing artifact. The COPY BLOCKS
inside are user-facing (and are humanized). The surrounding planning prose is
internal.
-->

## 1. What shipped (substance, for grounding)

The diff in this workflow makes one architectural change with cascading doc impact:

- `.claude/workflows.jsonl` becomes the canonical source of truth for every workflow this baseline can execute. Six tracks ship in the pristine template: four selectable (`intake-full`, `spec-entry`, `tdd-quickfix`, `chore`) and two sub-tracks (`swarm-implementation`, `tdd-worker-chain`).
- `.claude/schemas/workflow-track.v1.json` is the referenced JSON Schema, tier-classified `NEVER_TOUCH`.
- Article IV is amended from "11-phase pipeline is the only sanctioned path" to "`workflows.jsonl` is the source of truth; Article IV declares the invariants every track must satisfy (I1..I11)". The 11-phase shape survives as the `intake-full` track.
- `/triage` becomes an LLM-driven track selector. It reads `workflows.jsonl`, classifies the request, and presents the picked track plus alternates through `AskUserQuestion`. The user always confirms; no threshold-based auto-skip.
- `/harness` becomes a graph executor. It loads the Track, walks the DAG, resolves selector-node alternates by evaluating preconditions in declaration order, expands sub-tracks inline, and dispatches `can_parallel` clusters concurrently.
- A one-shot migrator rewrites pre-§18 `workflow.json` files (entry_phase + no track_id) into the post-§18 shape at preflight.
- `/init-project doctor` is a new sub-command that detects baseline drift in `workflows.jsonl`, the schemas directory, and the Article IV mirrors, and offers interactive fixes.
- The `cli-copy-review` skill ships with this repo's own `workflows.jsonl` as an inline node in `intake-full` and `tdd-quickfix` (between `memory-flush` and `grant-commit`). It travels into end-user installs only when their `workflows.jsonl` references it. Hardcoded conditional references in baseline-owned skills are removed.
- The `.claude/` tooling convention is codified in `seed.md §3`. All user-shipped baseline tooling lives under `.claude/`. The only project-root exceptions are `CLAUDE.md` and `.mcp.json`.

This makes the public-facing claim about "an 11-phase workflow" technically still true (it is the canonical `intake-full` track), but incomplete. Tracks are the new abstraction. Phases are nodes inside a track.

## 2. Project doc deltas

| Surface | Current claim | New claim |
|---|---|---|
| `README.md:44` | "**38 skills** organised into ten categories ... an **11-phase workflow** from intake to commit ..." | Reframe around tracks. Keep the 38/22/3 punch numbers. Add the `workflows.jsonl` extension surface explicitly. |
| `README.md:65` | "Skills ... **36**" | `38` (matches line 44 and the appendix). |
| `README.md:67` | "Workflow phases — intake → ... → commit \| **11** \| enforced by `track_guard`" | Reword the row to "Workflow tracks (canonical) ... **4** ... declared in `.claude/workflows.jsonl`". Sub-row for `intake-full` nodes if needed. |
| `README.md:175` | "The 11-phase workflow is enforced at the write boundary by `track_guard`. Phase ordering is binding ..." | Reword to "Tracks declared in `.claude/workflows.jsonl` are enforced at the write boundary by `track_guard`. Node ordering inside each track is binding ..." |
| Inline header docstrings on new `src/cli/` modules | Already present (verified). | No action. |
| `CLAUDE.md` Article IV + Article XI | Already amended by `/implement`. | No action. |
| `docs/init/seed.md` §3 + §18 | Already added. | No action. |

## 3. Website surfaces affected (handoff to design-ui)

| Page | Surface | Type |
|---|---|---|
| `site-src/index.njk:104-107` (Concept 03) | "Eleven phases, four gates" panel | **Copy + visual.** Header changes from a count to an abstraction. Sub-grid showing the 4 canonical tracks + 1 user-extension slot. |
| `site-src/index.njk:180-462` (How it flows + bento) | 11-cell bento + caption | **Visual rework.** Bento composition encodes "11 cells = 11 phases". New abstraction is "N tracks; intake-full is the canonical one." Either re-cast the bento as the intake-full node-DAG (still 11+ cells, but framed as one track's body) or replace with a track-picker diagram. Design-ui owns. |
| `site-src/index.njk:23-29` (meta-strip) | Hooks · Skills · Subagent · Phases · Gates | **Copy.** "Phases: 11" tile is the most fragile. Two reasonable options: keep `Phases: 11` as the intake-full count, or replace with `Tracks: 4`. |
| `site-src/index.njk:582` (FAQ #2) | "Add a named exception ..." | **Copy.** Add a second sentence: extending behaviour with a project-local track is the sanctioned alternative for cases an exception cannot cover. |
| `site-src/index.njk` (NEW FAQ) | none | **Copy add.** New entry: "Can I declare my own workflow track?" |
| `site-src/hooks.njk:74` (`track_guard` row) | "Enforce 11-phase ordering for workflow artifacts" | **Copy.** Replace with "Enforce per-track DAG ordering for workflow artifacts." |
| `site-src/install.njk:41` (Git auto-except) | "Phase 11 auto-excepts ..." | **Copy.** "The `commit` node of the chosen track auto-excepts ..." |
| `site-src/install.njk:124` (Quickstart) | "Run your first `/triage`" | **Copy.** Mention that `/triage` opens an `AskUserQuestion` confirming the picked track plus alternates. |
| `site-src/skills/core.njk` (triage) | "Picks the workflow entry phase and writes `workflow.json`." | **Copy.** Replace with the LLM-driven track-selector framing. |
| `site-src/skills/core.njk` (harness) | "Drives the workflow end-to-end, yielding at consent gates." | **Copy.** Replace with the graph-executor framing. |
| `site-src/skills/core.njk` (swarm-plan) | "Decomposes an approved spec into a dependency-ordered swarm plan." | **Copy.** Mention that swarm-plan now emits a runtime sub-track overlay to `.claude/state/swarm/<slug>.jsonl` that the harness reloads. |
| `site-src/_data/baseline.json` | `skills.total: 36`, `categoriesWord: "nine"` | **Data fix.** Bump to `38` and `"ten"`. Add a new top-level `tracks.canonical: 4` field for the meta-strip tile if we keep it. |
| NEW page candidate: `site-src/workflows.njk` | none | **Add.** A reference page introducing tracks, the four canonical tracks, the predicate vocabulary, the validator invariants, and how to declare a project-local track. Reuses the existing docs layout. Design-ui scopes. |

## 4. Drafted copy blocks (pre-humanizer)

The blocks below are the drafted replacement prose. After §5 I assemble them into a single payload and invoke `Skill(humanizer)`. The humanized output replaces the drafts in §6, which is what design-ui consumes.

### Block A — `README.md:44` overview paragraph

```
The Claude Code Baseline is a repository overlay shipped via
`npx @friedbotstudio/create-baseline ./target`. It installs **22 hooks** at
Claude's tool boundaries, **38 skills** organised into ten categories, **1
subagent** for parallel work in isolated worktrees, **4 canonical workflow
tracks** declared in `.claude/workflows.jsonl` (the longest of which runs
11 nodes from intake to commit), and **3 user-typed consent gates** that
Claude cannot forge.
```

### Block B — `README.md:65-67` inventory rows

```
| **Skills** across artifact drafting, workflow phases, phase workers, spec helpers, orchestration, memory, audit, alternate tracks, shared globals, and maintenance | 38 | `.claude/skills/` |
| **Workflow tracks** declared in `.claude/workflows.jsonl`. Canonical set: `intake-full` (11 nodes), `spec-entry`, `tdd-quickfix`, `chore`. Two sub-tracks (`swarm-implementation`, `tdd-worker-chain`) are referenced by selector nodes inside the canonical set. | 4 selectable + 2 sub | `.claude/workflows.jsonl`, enforced by `track_guard` |
| **Consent gates** — `/approve-spec`, `/approve-swarm`, `/grant-commit`. User-typed; structurally un-invokable by Claude | 3 | `consent_gate_grant` UserPromptSubmit hook |
```

### Block C — `README.md:175` enforcement paragraph

```
Tracks declared in `.claude/workflows.jsonl` are enforced at the write
boundary by `track_guard`. Node ordering inside each track is binding; the
only mechanism to bypass a node is the `exceptions` array in
`.claude/state/workflow.json`, written by `/triage` at workflow creation
time. The `chore` track is a stripped-down ordering of the same gates, with
the test-first nodes removed because there is nothing to test-first.
Projects can declare their own tracks (or add nodes to the canonical ones)
by editing their own `.claude/workflows.jsonl`. Article IV's invariants
(I1..I11) bind every track regardless of who wrote it; a track that omits
`/grant-commit` before a `commit` node, or whose dependency graph contains
a cycle, is rejected at triage time with a named error.
```

### Block D — `site-src/index.njk` Concept 03 panel

```
03 · Workflow tracks
Four canonical tracks, declared in workflows.jsonl

Every kind of work the baseline runs is a track: a DAG of skill nodes with
dependencies, optional consent gates, and optional parallel clusters. The
shipped set covers four shapes: intake-full (11 nodes for a new feature
needing a written spec), spec-entry (bugfix that starts at /spec),
tdd-quickfix (localised quickfix with a known failing case), and chore (no
failing test required). Triage classifies the user's request, presents the
picked track plus alternates via AskUserQuestion, and materialises the
chosen track's DAG into the TaskList. Three workflow-phase consent gates
sit inside the tracks: /approve-spec after spec, /approve-swarm inside the
swarm sub-track, and /grant-commit before commit. Skipping any node needs
an explicit exception in workflow.json, written by triage. Projects extend
the set by editing their own workflows.jsonl.
```

### Block E — `site-src/index.njk` "How it flows" lede

```
Tracks are the unit of orchestration. Each track is a DAG of skill nodes,
declared once in workflows.jsonl and validated against eleven invariants at
every read. The harness loads the chosen track, walks the DAG, resolves
selector nodes by evaluating preconditions in declaration order, expands
sub-tracks inline, and dispatches can_parallel clusters concurrently. The
diagram below shows the intake-full track, which runs from intake to
commit through eleven nodes. Three filled squares mark the consent gates.
A fourth gate (/grant-push) sits outside the phase pipeline and gates
pushes to protected branches. All four are user-typed commands; Claude
cannot reach the code path that writes the markers.
```

### Block F — `site-src/index.njk` bento `<figcaption>`

```
The intake-full track, eleven nodes from request to commit. The
composition reads as five zones: a preamble strip (intake, scout,
research), the plan anchor (spec as the hero cell), the execution arm (tdd
as a tall right-side cell), a mid strip (simplify, security, integrate,
document), and the paired endings (archive with memory-flush; changelog
with commit as the ship pair). The two filled accent squares mark
workflow-phase gates /approve-spec and /grant-commit. The third phase gate,
/approve-swarm, sits inside the swarm-implementation sub-track of phase 6
and is not shown. The fourth gate, /grant-push below the grid, is a
runtime gate that opens a five-minute window for git push on a protected
branch. Three other tracks ship in the same workflows.jsonl: spec-entry
(skips intake/scout/research), tdd-quickfix (starts at tdd), and chore (no
failing-test-driven node).
```

### Block G — `site-src/index.njk` FAQ #2 (existing) addition

```
Add a named exception to .claude/state/workflow.json via /triage. The
exception is recorded, scoped to the current workflow, and visible to the
audit. For a recurring need that the four canonical tracks do not cover,
declare a project-local track in .claude/workflows.jsonl instead. The
declared track binds against the same Article IV invariants and survives
baseline upgrades verbatim (the file is tier-classified NEVER_TOUCH).
```

### Block H — NEW FAQ entry on `site-src/index.njk`

```
Q: Can I declare my own workflow track?
A: Yes. Tracks live in .claude/workflows.jsonl, one record per line. Each
track is a DAG of skill nodes with depends_on, blocks, can_parallel, and
optional needs_user consent flags. Selector nodes pick among alternates by
evaluating declarative preconditions. The file is tier-classified
NEVER_TOUCH; baseline upgrades preserve your additions verbatim. Article
IV's eleven invariants bind every track regardless of who wrote it; a
malformed track is rejected at triage time with a named error citing the
violated invariant. Run /init-project doctor to validate your file against
the shipped JSON Schema before triage runs.
```

### Block I — `site-src/hooks.njk:74` (`track_guard` row)

```
Enforce per-track DAG ordering for workflow artifacts.
```

### Block J — `site-src/install.njk` Quickstart paragraph

```
/triage classifies the request and presents the picked track plus
alternates via AskUserQuestion. You confirm or pick an alternate. /harness
then walks the chosen track end to end, yielding at consent gates so you
can review.
```

### Block K — `site-src/skills/core.njk` triage description

```
triage. Reads workflows.jsonl, classifies the request via Claude reading
each track's selector_hints, and presents the picked track plus alternates
via AskUserQuestion. On confirmation, materialises the chosen track's DAG
into the TaskList and writes workflow.json.
```

### Block L — `site-src/skills/core.njk` harness description

```
harness. Graph executor. Loads the chosen track, walks the DAG, resolves
selector nodes by evaluating preconditions in declaration order, expands
sub-tracks inline, dispatches can_parallel clusters concurrently, and
yields at consent gates. Runs the one-shot pre-§18 workflow.json migrator
at preflight.
```

### Block M — `site-src/skills/core.njk` swarm-plan description

```
swarm-plan. Decomposes an approved spec into a dependency-ordered runtime
sub-track that the harness reloads as an overlay on the canonical
workflows.jsonl. Output lives at .claude/state/swarm/<slug>.jsonl.
```

### Block N — NEW page or section: tracks reference

```
H1: Workflow tracks

A track is a DAG of skill nodes declared in .claude/workflows.jsonl. One
record per line. Each node names a skill, lists its predecessors and
successors, and optionally flags itself as a consent gate or as part of a
parallel cluster.

H2: The canonical set

Four selectable tracks ship in the pristine template:

- intake-full: eleven nodes for a new feature that needs a written spec.
  Intake, scout, research, spec, /approve-spec, implementation (selector:
  swarm or solo TDD), simplify, security, integrate, document, archive,
  memory-flush, /grant-commit, changelog, commit.
- spec-entry: starts at /spec. For a bugfix where the failing case is
  contract-level. Skips intake, scout, research.
- tdd-quickfix: starts at /tdd. For a localised bug with a known failing
  case. Skips spec entirely.
- chore: stripped-down. For documentation, configuration tweaks, dependency
  bumps. Skips scenario and implement.

Two sub-tracks are referenced by selector nodes inside the canonical set:
swarm-implementation (parallel dispatch via swarm-plan, swarm-dispatch) and
tdd-worker-chain (solo fallback).

H2: Article IV invariants

Every track in workflows.jsonl satisfies eleven invariants. The validator
runs at install time (audit-baseline), at triage time (the LLM-driven
selector), and at harness time (per node before dispatch). The set is:

I1. Unique track_id across the file.
I2. Unique node.id within a track.
I3. type=task nodes carry exactly one of {skill, sub_track}. type=selector
    nodes carry non-empty alternates.
I4. Every depends_on and blocks reference resolves to a node.id in the
    same track.
I5. The dependency DAG is acyclic.
I6. Tracks declaring the commits invariant include a needs_user
    /grant-commit node ordered before the node with skill: "commit".
I7. Every sub_track reference resolves to a track with selectable: false.
I8. Every skill reference resolves to a known invokable: a skill in
    EXPECTED_SKILLS plus project.json additions.skills, or a consent-gate
    command.
I9. needs_user nodes appear in dependency order before any node that
    depends on their consent.
I10. A selector node's alternates share the same shape (all skill, or
     all sub_track).
I11. Every Predicate.name resolves to a known v1 predicate.

H2: Predicate vocabulary (v1)

The closed set of declarative predicates that may appear in Track or
Alternate preconditions:

- requires_git: git rev-parse --is-inside-work-tree exits 0 at the
  project root.
- requires_user_override: the user explicitly named this alternate in
  conversation (e.g., "use solo").
- requires_min_components: the approved spec has at least N C4 Components.
- requires_phase_completed: the named phase appears in
  workflow.json -> completed.
- requires_skill_present: the named skill exists in EXPECTED_SKILLS plus
  additions.skills.

Adding a new predicate is a constitutional change. Update seed.md §18.4,
the predicate validator (src/cli/workflows-validator-predicates.js), and
the corresponding seed.template.md mirror.

H2: Declaring a project-local track

Add a Track record to .claude/workflows.jsonl. Run /init-project doctor to
validate the file against the shipped JSON Schema and the Article IV
invariants. The doctor offers interactive fixes for the failures it
detects.
```

## 5. Visual rework items (design-ui owns)

These are not pure copy swaps. Each needs visual layout work in addition to the new text.

1. **Bento diagram in `index.njk:182-461`.** Two paths:
   - **Path A (minimal):** keep the bento as is and reframe it as "the intake-full track". The diagram stays; the framing copy in §4 Blocks E and F updates. Cheapest path; preserves the marketing punch of the existing visual. Downside: the diagram does not communicate the existence of the three other tracks.
   - **Path B (full).** Replace the bento with a two-tier composition: a top strip showing the four canonical tracks (intake-full as the hero, the others as smaller cells), and a drill-in detail showing intake-full's node-DAG. Higher information density; communicates the new abstraction directly. Larger design lift.
   - **Recommendation:** Path A for this workflow's website pass. Path B as a follow-up if the tracks page (Block N) needs the upgraded diagram.

2. **Meta-strip in `index.njk:23-29`.** The "Phases · 11" tile is the most fragile. Three options: keep `Phases: 11` and footnote it as the intake-full count, replace with `Tracks: 4`, or add a sixth tile so both appear. Recommendation: keep `Phases: 11` (preserves the punch number) and add `Tracks: 4` as a sixth tile.

3. **Concept 03 panel.** New header, new sub-grid showing the four tracks. The current panel is text-only; the new framing benefits from a small inline diagram (e.g., four labelled chips) but stays one panel.

4. **Tracks reference page (Block N).** Decision: is this its own page (`site-src/workflows.njk`), or a section inside the existing docs site? If a new page, it needs nav entry + sidebar wiring (`site-src/_data/nav.json`, `site-src/_includes/sidebar.njk`).

## 6. Counts to refresh (mechanical)

- `site-src/_data/baseline.json`:
  - `skills.total: 36` → `38`
  - `skills.categoriesWord: "nine"` → `"ten"`
  - `skills.byCategory`: bump `phases: 10` → `11` (cli-copy-review is a phase-adjacent worker; check the audit's category split before changing), and add a `maintenance: 1` field if the new category lands.
  - Optional: `tracks.canonical: 4` (new) for the meta-strip tile.
- `README.md:65` skills count `36` → `38`.
- `README.md` "ten categories" already correct on line 44; the inline row on line 65 enumerates "nine categories" implicitly through its list. Re-derive from `manifest.owners.skills` and update.

## 7. SVG audit (design-ui pre-compute)

Every SVG on the site, classified. Three categories: **REWORK** (the SVG geometry encodes the old abstraction and needs new geometry), **CAPTION-ONLY** (the SVG is conceptually still correct but the surrounding figcaption or aria-labelledby text needs an update — already covered in §4 Blocks E and F), and **NO CHANGE** (decorative or orthogonal to the workflows.jsonl change).

### 7.1 Inline SVGs in pages

| # | Location | Role | Category | Reason |
|---|---|---|---|---|
| 1 | `site-src/index.njk:55` `strata-svg` | Genesis · Constitution · Implementation · Tool boundary stack (Article I.4 precedence figure) | **NO CHANGE** | Encodes constitutional precedence, not workflow shape. Untouched by §18. |
| 2 | `site-src/index.njk:121` `hook-diag-title` | User → Claude → Tool → Result with UserPromptSubmit / PreToolUse / PostToolUse hook lines | **NO CHANGE** | Encodes the tool-boundary mechanism. Cell labels reference generic hook events; no phase counts inside the SVG. |
| 3 | `site-src/index.njk:183` `arch-bento workflow-diag-title` | The 11-cell bento (intake → ... → commit) with consent-gate squares + runtime gate rule | **REWORK** | This is the main casualty. The SVG geometry literally encodes "11 phases as bento cells." Three SVG-level changes needed: (a) ord `06` label on the tall TDD cell becomes a `selector` annotation since implementation is now a selector node; (b) the `<title>` and `<desc>` (lines 184-185) currently say "eleven-phase workflow" — must become "intake-full track"; (c) the figcaption (line 462) is the Block F copy swap. **Path A (recommended):** keep the bento, change the title/desc/caption to frame it as the intake-full track. **Path B (heavier):** redesign the bento entirely as a track-picker (four cells: intake-full / spec-entry / tdd-quickfix / chore) with the current 11-cell layout as a drill-in. Defer Path B. |
| 4 | `site-src/index.njk:488, :499` arch-spine arrows | Decorative left/right arrows in the "Architectural principle" section | **NO CHANGE** | Pure ornament. |
| 5 | `site-src/index.njk:557` `cli-check` | Checkmark glyph in the install copy strip | **NO CHANGE** | Decorative. |
| 6 | `site-src/memory.njk:68` `memflow-svg` (lifecycle) | memory_stop → _pending → /memory-flush → canonical → cite, with re-verify loops | **NO CHANGE** | Memory lifecycle. Orthogonal to the track abstraction. Step labels remain accurate. |
| 7 | `site-src/memory.njk:137` `backlog-states-cap` | Backlog state transitions: open → picked-up / dropped → auto-close | **NO CHANGE** | The figcaption (line 182) references `workflow.json` + `/commit` + `source_backlog_keys`. All three still exist post-§18. The SVG itself encodes state transitions, not workflow phases. Verify the figcaption once more during the design-ui pass, but no edits expected. |

### 7.2 Hero symbols (per-page hero glyphs)

| # | File | Glyph | Category | Reason |
|---|---|---|---|---|
| 8 | `site-src/_includes/hero-symbols/install.njk` | dropbox-svg | **NO CHANGE** | Decorative hero. |
| 9 | `site-src/_includes/hero-symbols/skills.njk` | comptree-svg (composition tree) | **NO CHANGE** | Decorative hero. |
| 10 | `site-src/_includes/hero-symbols/memory.njk` | memring | **NO CHANGE** | Decorative hero. |
| 11 | `site-src/_includes/hero-symbols/hooks.njk` | boundary-svg | **NO CHANGE** | Decorative hero. |
| 12 | `site-src/_includes/hero-symbols/cli.njk` | cmdfork-svg | **NO CHANGE** | Decorative hero. |
| 13 | `site-src/_includes/hero-symbols/swarm.njk` | fanmerge-svg (recipe → 3 worktrees → merge audit → commit) | **NO CHANGE (but flag prose)** | The SVG geometry still illustrates the swarm-dispatch pattern correctly. What changes is the *framing* in the surrounding `site-src/swarm.njk` prose: the swarm phase is now the `swarm-implementation` sub-track selected by `intake-full`'s implementation node when `requires_git` + `requires_min_components:3` both pass. Specifically `site-src/swarm.njk` §IV "When to swarm vs solo" (around line 86) needs rewording to reference the selector-node alternates mechanism rather than the harness's runtime decision. Glyph stays. |

### 7.3 Chrome and decorative SVGs

| # | Location | Glyph | Category |
|---|---|---|---|
| 14 | `site-src/_includes/topnav.njk:20` | GitHub icon | **NO CHANGE** |
| 15 | `site-src/_includes/install-pill.njk:9, 13` | Copy + check glyphs | **NO CHANGE** |
| 16 | `site-src/_layouts/base.njk:30` | `svg-defs` (defs container) | **NO CHANGE** |
| 17 | `.github/assets/logo-baseline.svg` | Wordmark logo | **NO CHANGE** |

### 7.4 New SVG candidates (design-ui decides)

These do not exist yet. Design-ui may want to add them when applying the new copy:

- **Concept 03 sub-grid (`site-src/index.njk` panel 3).** Four small labelled chips, one per canonical track: `intake-full`, `spec-entry`, `tdd-quickfix`, `chore`. Optional. Could ship as plain HTML chips instead of SVG. Recommendation: HTML chips with the same `chain-chip` styling already used inside the TDD cell. No new SVG needed.
- **Tracks reference page diagram (`site-src/workflows.njk`, if created).** Either: (a) reuse the existing bento as the intake-full drill-in and add a one-line tracks-picker strip above it, or (b) draw a fresh track-DAG diagram per track. Path (a) is cheaper and preserves the existing geometry investment. Defer (b) unless the page warrants its own visual identity.

### 7.5 Summary

- **1 SVG needs rework**: `index.njk` arch-bento at line 183 (title + desc + figcaption changes; geometry unchanged in Path A).
- **0 SVGs need geometry changes** under Path A.
- **1 SVG file is correct but lives next to prose that needs updating**: `hero-symbols/swarm.njk` glyph stays; `site-src/swarm.njk` §IV prose needs the sub-track framing.
- **15 SVGs are no-change** (decorative, constitutional, orthogonal to §18).

The single material design call for design-ui in this workflow is whether to extend Path A (caption-only update on the bento) into Path B (replace the bento with a track-picker). Recommendation: Path A for this workflow's website pass. Park Path B as a follow-up task in `backlog.md` if the tracks reference page (Block N) lands as its own route.

## 8. Handoff to design-ui

When the user resumes the workflow and invokes `design-ui`:

1. Apply humanized copy from §4 (post-humanizer output produced in the planning conversation; reproduced verbatim from the assistant's reply that closed the document phase) to each surface in §3.
2. Visual rework per §5 + the SVG audit in §7. Recommended Path A for the bento on this pass.
3. Counts refresh per §6.
4. Decide whether the tracks reference (Block N) is a new `site-src/workflows.njk` page or an inline section in `index.njk`. If new page, wire the nav + sidebar.
5. Re-derive `baseline.json` counts from `manifest.owners.skills`.
6. Update `site-src/swarm.njk` §IV prose to reference the `swarm-implementation` sub-track + selector-node alternates mechanism (the hero symbol SVG stays; only the prose around it shifts).

The plan deliberately stops short of writing to `site-src/`. Design-ui owns that lane per Article X.2.
