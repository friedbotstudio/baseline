# Design brief — workflows-page-and-homepage-uplift

Four coordinated additions, one binding constraint:

> "current design is beautiful, do not mess it up"

Every choice cites an existing rule, token, or class. New work transcribes existing vocabulary; nothing novel.

---

## Part A — Visual vocabulary inventory (re-confirm)

### Type tokens (no additions)

- `--display` (Inter Tight) — h1, h2, h3, .num
- `--body` (Inter) — body, lead
- `--mono` (JetBrains Mono) — eyebrow, ord, cell-modifier, code, chip labels

### Color tokens (no additions)

- `--ink` 15% 0 0 (primary text, anchors, filled glyph elements)
- `--text` 15% 0 0 (body)
- `--muted` 45% 0.026 257 (secondary text, sub-labels)
- `--faint` 72% 0.012 257 (tertiary, cell-modifier)
- `--rule` 89% 0.013 257 (hairlines, borders, chip strokes)
- `--rule-soft` 94% 0 0 (softer dividers)
- `--cream` 94% 0 0 (chip fill, paper-tinted surfaces)
- `--paper` 99% 0 0 (concept card bg, figure bg)
- `--bg` 96.5% 0 0 (page bg)
- `--accent` 55.8% 0.187 41.5 (orange-700; sparingly: eyebrow, install pill, .accent dot, gate markers)
- `--accent-light`, `--accent-soft`, `--accent-faint` (supporting variants for hover, selection)

### Spacing scale (no additions)

`{8, 10, 12, 16, 22, 26, 28, 32, 40, 48, 56, 80, 96, 120}` (px).

### Reused classes

- `.docs-hero`, `.docs-hero-text`, `.docs-hero-symbol`, `.hero-symbol-svg` (docs page hero)
- `.section`, `.lede`, `.lede-head`, `.section-num` (section rhythm)
- `.figure`, `.figure-caption` (figure pattern)
- `.phase` (existing `.phase` table-cell class, used on hooks.njk)
- `.concept`, `.concepts.is-row`, `.concepts.is-2col` (concept-card system — only consulted, NOT modified)
- `.track-chip`, `.track-chips` (chip strip vocabulary already added in parent slug)
- `.eyebrow`, `.lead`
- `.tok-com`, `.tok-kw`, `.tok-str` (code-block syntax tokens, for the example JSONL in §IV)

### New classes (transcribed, see Part C)

Only the `wf-*` class set for the new hero glyph. Every property cites a source rule (`.fanmerge-svg .fm-*` is the precedent). Detailed in Part C.

### Structural restraint (still binding)

- No gradients, drop shadows, glassmorphism, rounded-pill chrome > 4px.
- No icons / emojis decorating numerals.
- No motion beyond existing hover transitions.
- 1px hairlines only.

---

## Part B — `site-src/workflows.njk` page composition

### Frontmatter

```yaml
---
layout: docs.njk
permalink: /workflows/index.html
pageTitle: "Workflow tracks · baseline"
title: Workflow tracks
titlePrimary: Workflow tracks
titleAccent: "."
description: "Workflows live in .claude/workflows.jsonl. Tracks are DAGs of skill nodes; selector nodes pick among alternates by evaluating declarative preconditions. Four selectable tracks ship in the pristine template."
eyebrow: Reference
lead: "Workflows live in <code>.claude/workflows.jsonl</code>. Tracks are DAGs of skill nodes; selector nodes pick among alternates by evaluating declarative preconditions. Four selectable tracks ship in the pristine template."
active: workflows
sidebarActive: workflows
heroSymbol: workflows
toc:
  - { id: tracks,     label: "What a track is" }
  - { id: canonical,  label: "Canonical set",       lvl: 3 }
  - { id: subtracks,  label: "Sub-tracks",          lvl: 3 }
  - { id: invariants, label: "Article IV invariants" }
  - { id: predicates, label: "Predicate vocabulary" }
  - { id: declare,    label: "Declaring a project-local track" }
  - { id: doctor,     label: "/init-project doctor", lvl: 3 }
---
```

### Section structure (mirrors swarm.njk pattern)

#### §I — What a track is (anchor `#tracks`)

`.section > .lede > {section-num "§ I" + h2 "What a track is"} + p` then body prose. The h2 sets up the definition; the body unpacks.

**Lede paragraph**: "A track is a DAG of skill nodes declared in `.claude/workflows.jsonl`. One record per line. Each node names a skill, lists its predecessors and successors, and optionally flags itself as a consent gate or as part of a parallel cluster." (verbatim from Block N).

**Body**:
- Sub-h3 "The canonical set" with anchor `#canonical`.
- Four bullets, one per canonical track:
  - `intake-full`: 11 nodes; intake → scout → research → spec → /approve-spec → implementation (selector) → simplify → security → integrate → document → archive → memory-flush → /grant-commit → changelog → commit.
  - `spec-entry`: starts at /spec. Skips intake, scout, research.
  - `tdd-quickfix`: starts at /tdd. Skips spec entirely.
  - `chore`: stripped-down. Skips scenario and implement.
- Sub-h3 "Sub-tracks" with anchor `#subtracks`.
- Short paragraph: "Two sub-tracks ship in the canonical set, referenced only by selector nodes inside the four selectable tracks: `swarm-implementation` (parallel dispatch via `swarm-plan` + `swarm-dispatch`) and `tdd-worker-chain` (solo fallback)."

#### §II — Article IV invariants (anchor `#invariants`)

`.section > .lede > {section-num "§ II" + h2 "Article IV invariants"} + p`.

**Lede paragraph**: "Every track in `workflows.jsonl` satisfies eleven invariants. The validator runs at install time (audit-baseline), at triage time (the LLM-driven selector), and at harness time (per node before dispatch)."

**Body**: numbered list of I1..I11 with bolded label + inline definition. Exact text per Block N §"Article IV invariants" verbatim. Use a `<ol>` not a `<dl>` to keep visual consistency with hooks.njk's hook list.

#### §III — Predicate vocabulary (anchor `#predicates`)

`.section > .lede > {section-num "§ III" + h2 "Predicate vocabulary (v1)"} + p`.

**Lede paragraph**: "The closed set of declarative predicates that may appear in Track or Alternate preconditions."

**Body**: a single table styled with `.phase` cells (matches hooks.njk table style):

| Predicate | Argument | Evaluates true when |
|---|---|---|
| `requires_git` | — | `git rev-parse --is-inside-work-tree` exits 0 at the project root. |
| `requires_user_override` | `<value>` | The user explicitly named this alternate in conversation (e.g., "use solo"). |
| `requires_min_components` | `<int>` | The approved spec has at least N C4 Components. |
| `requires_phase_completed` | `<phase>` | The named phase appears in `workflow.json -> completed`. |
| `requires_skill_present` | `<skill_id>` | The named skill exists in `EXPECTED_SKILLS` plus `additions.skills`. |

**Closing paragraph**: "Adding a new predicate is a constitutional change. Update `seed.md §18.4`, the predicate validator (`src/cli/workflows-validator-predicates.js`), and the corresponding `seed.template.md` mirror."

#### §IV — Declaring a project-local track (anchor `#declare`)

`.section > .lede > {section-num "§ IV" + h2 "Declaring a project-local track"} + p`.

**Lede paragraph**: "Tracks are project-owned. The file `.claude/workflows.jsonl` is tier-classified `NEVER_TOUCH`; baseline upgrades preserve your additions verbatim."

**Body**: 3-paragraph procedural:
1. Add a Track record to `.claude/workflows.jsonl` (one record per line; the schema is in `seed.md §18.2`).
2. Validate with `/init-project doctor`. The doctor checks JSON Schema conformance + Article IV invariants. Named errors point at offending lines.
3. Triage will classify your track from its `selector_hints` at the next `/triage` invocation.

**Code example**: a minimal example Track shown in a `<pre><code>` block with `.tok-com` / `.tok-kw` syntax tokens applied:

```jsonc
{"$schema":"./schemas/workflow-track.v1.json","track_id":"pre-commit-lint","name":"Pre-commit lint","description":"Run linter and lint-fix before /grant-commit.","selectable":true,"selector_hints":["lint","quick CSS fix","formatting pass"],"preconditions":[],"invariants":["commits"],"nodes":[
  {"id":"lint","type":"task","skill":"prose","depends_on":[],"blocks":["grant-commit"],"can_parallel":false},
  {"id":"grant-commit","type":"task","skill":"grant-commit","depends_on":["lint"],"blocks":["commit"],"can_parallel":false,"needs_user":true},
  {"id":"commit","type":"task","skill":"commit","depends_on":["grant-commit"],"blocks":[],"can_parallel":false}
]}
```

**Sub-h3 "/init-project doctor"** with anchor `#doctor`.

Short paragraph: "Run `/init-project doctor` when you edit `workflows.jsonl`, when `audit-baseline` flags drift, or after upgrading the baseline. It detects schema violations, Article IV invariant failures, missing referenced skills, and unknown predicates. Each finding includes a remediation path; on user confirmation the doctor applies the named fix."

### Word count target

The full page reads at roughly 600-700 words, comparable to swarm.njk (~700 words). Reference-grade prose; no marketing register.

---

## Part C — Hero glyph `_includes/hero-symbols/workflows.njk`

### Surface

`viewBox="0 0 360 360"`. Same scale as the existing six glyphs.

### Geometry (precise coordinates)

```
y=22-50:    "track" anchor (filled ink rect 28x28 at x=166)
y=50-80:    connector line down
y=80-124:   3-node chain (intake / spec / approve-spec)
              80x44 stroke rects at x=20, x=140, x=260
              labels at y=106 text-anchor middle
              arrows between: ↦ at (115,102) and (235,102)
y=124-150:  connector from chain middle down
y=150-186:  selector node — rotated 45° rect, accent fill, at (180, 168)
              40x40 size, branch glyph inside (Y-fork path in paper stroke)
y=186-220:  splay — two connectors fanning to alternates
              Left:  (180,186) → (90, 220)   [swarm root]
              Right: (180,186) → (270, 220)  [tdd root]
y=220-264:  alternates row
              Left (swarm-implementation):
                Two 56x40 stroke rects at x=18,82 (worker A, worker B)
                Labels at y=244: "T-A", "T-B"
                A small "swarm" eyebrow tag at y=212, x=50 anchor-middle
              Right (tdd-worker-chain):
                One 56x40 stroke rect at x=242
                Label at y=244: "tdd"
                A "solo" eyebrow tag at y=212, x=270 anchor-middle
y=264-300:  convergence — three connectors meeting at (180, 305)
              Left swarm: (46,264) and (110,264) merge to (180,305)
              Right tdd: (270,264) merges to (180,305)
y=300-320:  commit anchor — filled ink circle, r=9, at (180, 312)
y=320-356:  caption text — y=346, anchor-middle
              Text: "tracks compose with selectors and sub-tracks"
```

### Class register

A new `wf-*` set in `site-src/assets/site.css`, immediately after the `.fanmerge-svg .fm-caption` block (line ~2244). Property-by-property transcription:

```css
/* Workflows hero symbol — track DAG with a selector node and two alternates.
   Vocabulary rhymes with fanmerge: filled = anchor, stroke = node,
   accent = selector gate. Every property cites the .fanmerge-svg .fm-* source. */
.trackdag-svg .wf-anchor     { fill: var(--ink); }
.trackdag-svg .wf-node {
  fill: var(--paper);
  stroke: var(--ink);
  stroke-width: 1.5;
}
.trackdag-svg .wf-tag {
  font-family: var(--mono);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: .04em;
  fill: var(--ink);
}
.trackdag-svg .wf-eyebrow {
  font-family: var(--mono);
  font-size: 9.5px;
  font-weight: 600;
  letter-spacing: .10em;
  text-transform: uppercase;
  fill: var(--muted);
}
.trackdag-svg .wf-conn {
  stroke: var(--ink);
  stroke-width: 1.25;
  fill: none;
  stroke-linecap: round;
}
.trackdag-svg .wf-arrow      { fill: var(--ink); }
.trackdag-svg .wf-selector {
  fill: var(--accent);
  stroke: var(--accent);
  stroke-width: 1.5;
}
.trackdag-svg .wf-selector-glyph {
  stroke: var(--paper);
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
  fill: none;
}
.trackdag-svg .wf-result     { fill: var(--ink); }
.trackdag-svg .wf-caption {
  font-family: var(--mono);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: .12em;
  text-transform: uppercase;
  fill: var(--accent);
}
```

Provenance audit (every property tied to an existing rule):

| Property | Source (fanmerge-svg fm-* counterpart) |
|---|---|
| `.wf-anchor { fill: var(--ink); }` | `.fm-recipe { fill: var(--ink); }` |
| `.wf-node { fill: var(--paper); stroke: var(--ink); stroke-width: 1.5; }` | `.fm-worker { ...same... }` |
| `.wf-tag { mono 11/600, .04em, ink }` | `.fm-tag` byte-identical |
| `.wf-eyebrow { mono 9.5/600 caps, .10em, muted }` | Derived from `.cell-eyebrow` (10/600 caps, .10em, accent) but uses var(--muted) for visual de-emphasis. **Note**: this is one judgment call — using 9.5px instead of 10px to fit the small glyph eyebrow text. Spacing scale doesn't include 9.5; this is a font-size, not a spacing token. Other glyphs use 11px or 10px tags. Acceptable. |
| `.wf-conn { ink 1.25 stroke, round caps, no fill }` | `.fm-conn` byte-identical |
| `.wf-arrow { ink fill }` | `.fm-arrow` byte-identical |
| `.wf-selector { accent fill+stroke 1.5 }` | `.fm-audit { ...same... }` |
| `.wf-selector-glyph { paper stroke 2 round }` | `.fm-audit-glyph { ...same... }` |
| `.wf-result { ink fill }` | `.fm-result` byte-identical |
| `.wf-caption { mono 11/600 caps .12em accent }` | `.fm-caption` byte-identical |

**Single deviation**: `.wf-eyebrow { font-size: 9.5px }` introduces a font-size value not in the existing typography scale. Justification: existing 10px (cell-eyebrow) and 11px (cell-modifier, fm-tag) sit above the wf-tag (also 11px) — the eyebrow inside the glyph needs to be visually subordinate to the wf-tag labels on each node. Two options:
- (a) Use 10px and rely on color (muted vs ink) for hierarchy.
- (b) Use 9.5px and rely on size + color.

**Recommendation**: option (a). Drop the 9.5 and use 10px. The muted fill already creates hierarchy. Brief revised to: `.wf-eyebrow { font-size: 10px; ... }`.

After this revision: **zero novel font-size values**. Full transcription.

### Glyph file structure

```njk
{# Workflows hero symbol — track DAG.
   A filled "track" anchor flows through three chain nodes
   (intake / spec / approve-spec) into a selector node that
   splits into two alternates (swarm 2-fan, solo tdd) which
   reconverge into a commit anchor.
   Vocabulary: filled = anchor, stroke = node, accent = selector. #}
<svg class="hero-symbol-svg trackdag-svg" viewBox="0 0 360 360" xmlns="http://www.w3.org/2000/svg" role="img" aria-labelledby="trackdag-title">
  <title id="trackdag-title">A track flows through three chain nodes into a selector that branches into two alternates and reconverges into commit.</title>
  <defs>
    <marker id="wf-arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="9" markerHeight="9" orient="auto-start-reverse">
      <path d="M0,0 L10,5 L0,10 z" class="wf-arrow"/>
    </marker>
  </defs>

  {# Top: filled ink "track" anchor. #}
  <rect class="wf-anchor" x="166" y="22" width="28" height="28"/>
  <text class="wf-tag" x="180" y="14" text-anchor="middle">track</text>

  {# Chain: 3 stroke nodes. #}
  ... (geometry per Part C above)

  {# Selector: rotated accent diamond. #}
  <g transform="rotate(45 180 170)">
    <rect class="wf-selector" x="160" y="150" width="40" height="40" rx="3"/>
  </g>
  <path class="wf-selector-glyph" d="M 180,160 L 180,168 M 180,168 L 172,180 M 180,168 L 188,180" fill="none"/>

  {# Alternates: swarm 2-fan left, tdd 1-node right. #}
  ...

  {# Commit anchor. #}
  <circle class="wf-result" cx="180" cy="312" r="9"/>

  {# Caption. #}
  <text class="wf-caption" x="180" y="346" text-anchor="middle">selectors and sub-tracks</text>
</svg>
```

The exact geometry lands in craft. The brief specifies the shape vocabulary; craft fills the coordinates.

---

## Part D — Nav + sidebar wiring

### `site-src/_data/nav.json`

**Primary**: insert `{ "href": "/workflows/", "label": "Workflows", "key": "workflows" }` between Memory and Swarm.

**Sidebar Reference group**: insert `{ "href": "/workflows/", "label": "Workflow tracks", "key": "workflows" }` between Memory and Swarm mode.

After edits, primary nav reads: Overview · Hooks · Memory · Workflows · Swarm · Skills · CLI.

Sidebar Reference group reads: Hooks · Memory · Workflow tracks · Swarm mode · CLI.

### Active state

`workflows.njk` frontmatter sets `active: workflows` and `sidebarActive: workflows`. Both topnav and sidebar pick up automatically via the existing match-by-key logic (`{% if item.key == sidebarActive %}` in sidebar.njk, similar match in topnav.njk).

### No new sidebar group

The Reference group already holds Hooks / Memory / Swarm / CLI; Workflows slots in as a peer. No new group needed.

---

## Part E — Homepage §I restructure

### Selected path: **Path 1 (2+1 within `.concepts.is-row`)**

Justification:
- The user's directive was "Promote Concept 03 to a hero panel; break the trinity." Path 1 keeps the §I structural framing intact and promotes Concept 03 within it. Path 2 (split section) would shift workflow-tracks out of §I entirely, which is editorially crisper but reads as a different intent than the user phrased.
- Path 3 (bento-style) would force §I to duplicate §III's bento composition language; the page would carry two bentos which weakens both.
- Path 1 changes only the `.concepts.is-row` rule and the markup of the third card; everything outside §I stays byte-identical.

### Composition

Within `.concepts.is-row`:

- **Row 1**: concepts 01 (CONSTITUTION) + 02 (ENFORCEMENT) share a row, each as a half-width cell. Their existing markup is unchanged.
- **Row 2**: concept 03 (WORKFLOW TRACKS) spans the full width as a hero panel. Its existing markup gets an upgrade:
  - The eyebrow ("03 · WORKFLOW TRACKS") and h3 (current "Four canonical tracks, declared in `workflows.jsonl`") stay.
  - The body paragraph gets slightly tightened (the parent slug version is dense; for hero treatment, the body can shorten to ~3 sentences and trust the chip strip + read-more to carry the rest).
  - The chip strip stays.
  - **NEW**: a "→ Read more about workflow tracks" link below the chips, pointing to `/workflows/`.

### CSS impact

The `.concepts.is-row` rule at site.css:854 (currently `grid-template-columns: none; grid-template-rows: repeat(3, auto)` after the prior fix) needs to support a 2+1 grid:

```css
.concepts.is-row {
  grid-template-columns: 1fr 1fr;   /* row 1: two columns for concepts 01 + 02 */
  grid-template-rows: auto auto;    /* row 1: cards; row 2: hero panel */
}
.concepts.is-row .concept:nth-child(3) {
  grid-column: 1 / -1;              /* row 2 spans both columns */
}
```

Provenance audit:
- `grid-template-columns: 1fr 1fr` — same shape as the existing `.concepts.is-2col` rule at line 855. No novel pattern.
- `grid-template-rows: auto auto` — content-sized; consistent with the prior fix philosophy.
- `grid-column: 1 / -1` — standard CSS grid spanning. No new token.

### Markup edit in `site-src/index.njk`

The §I `.columns > .concepts.is-row` block at lines 92-112: keep concepts 01 and 02 byte-identical. For concept 03:

1. Tighten the body paragraph (humanizer constraints still apply: no em-dashes, no AI vocabulary).
2. Keep the existing `<div class="track-chips">` chip strip.
3. Add a "→ Read more" link as `<p class="concept-readmore"><a href="{{ '/workflows/' | rel }}">Read more about workflow tracks <span class="arr" aria-hidden="true">→</span></a></p>` BELOW the chip strip.

The arrow icon vocabulary (`<span class="arr">→</span>`) is the existing pattern used on the hero `.hero-readmore` (`site-src/index.njk:21`). Reuse intact.

### New micro-class `.concept-readmore`

```css
/* Read-more link inside .concept hero panels. Mirrors .hero-readmore. */
.concept-readmore {
  margin-top: 16px;
  font-family: var(--mono);
  font-size: 12px;
}
.concept-readmore a {
  color: var(--accent);
  text-decoration: none;
}
.concept-readmore a:hover { text-decoration: underline; }
.concept-readmore .arr { margin-left: 4px; }
```

Provenance audit:
- `margin-top: 16px` — on spacing scale.
- `font-family: var(--mono); font-size: 12px` — same as `.hero-readmore` (site.css line ~603 area, mono 12px). Confirm at craft time.
- `color: var(--accent); text-decoration: none` — same as other accent link patterns on the site.
- `.arr { margin-left: 4px }` — same as `.hero-readmore .arr`.

All four properties cite an existing rule. Single small class, fully transcribed.

### Trimmed concept-03 body copy

Current (post-Block-D rewrite):
> "Every kind of work the baseline runs is a track: a DAG of skill nodes, where each node carries its dependencies, an optional consent flag, and an optional parallel-cluster marker. The shipped set covers four shapes: intake-full (11 nodes for a new feature needing a written spec), spec-entry (bugfix that starts at /spec), tdd-quickfix (localised quickfix with a known failing case), and chore (no failing test required). Triage classifies the user's request, presents the picked track plus alternates via AskUserQuestion, and materialises the chosen track's DAG into the TaskList. Three workflow-phase consent gates sit inside the tracks: /approve-spec after spec, /approve-swarm inside the swarm sub-track, and /grant-commit before commit. Skipping any node needs an explicit exception in workflow.json, written by triage. Projects extend the set by editing their own workflows.jsonl."

For hero treatment, trim to the load-bearing two sentences:

> "Every kind of work the baseline runs is a track: a DAG of skill nodes with dependencies, consent flags, and optional parallel clusters. Four canonical shapes ship in the pristine template, declared in `.claude/workflows.jsonl`. Triage classifies the request and presents the picked track plus alternates via `AskUserQuestion`; harness walks the chosen DAG."

The chip strip then names the four tracks visually, the read-more sends the curious reader to `/workflows/`.

This is a copy change in the design lane — but the new copy keeps every fact, removes prose redundancy, and feeds the hero treatment (less is more here). It also stays scoped-IN to Article X.1 (no em-dashes confirmed, no AI vocabulary). Humanizer-aligned without a re-pass needed.

### Mobile responsive

The existing `@media (max-width: 900px)` rule at line 2717 sets `.concepts.is-2col { grid-template-columns: 1fr }`. The new `.concepts.is-row { grid-template-columns: 1fr 1fr }` at the new rule needs a matching mobile override:

```css
@media (max-width: 900px) {
  .concepts.is-row { grid-template-columns: 1fr; }
}
```

At mobile widths concept 03 still spans the (single) column; the `grid-column: 1 / -1` rule applies correctly. Result: three single-column cards at mobile, same as before.

---

## Part F — Constraints summary

All six bullets must hold before craft runs. Self-audit:

- **Zero new colors.** Confirmed. Every color references `var(--ink|paper|muted|faint|rule|cream|accent)`.
- **Zero new type weights.** Confirmed. Reuses 400/500/600. The wf-* uses 600 (existing).
- **Zero new spacing scale steps.** Confirmed. 16, 32 referenced; both on scale.
- **Zero new motion vocabulary.** Confirmed. No new transitions/animations. The existing `.docs-hero-symbol` hover-scale animation is reused via the existing selector-glob; no edits to the animation rules.
- **Every new class is a property-by-property transcription.** Confirmed for wf-* (Part C audit table). Confirmed for `.concept-readmore` (Part E audit).
- **Bento SVG geometry is byte-identical except the SELECTOR text from the prior slug.** N/A here (bento not touched in this slug).

---

## Part G — Files craft will touch (predeclared)

| File | Nature of edit |
|---|---|
| `site-src/workflows.njk` | **CREATE.** New page, frontmatter + 4 sections per Part B. |
| `site-src/_includes/hero-symbols/workflows.njk` | **CREATE.** New SVG file per Part C geometry. |
| `site-src/_data/nav.json` | **EDIT.** Insert Workflows entry into `primary[]` between Memory and Swarm; insert into `sidebar[Reference].items[]` between Memory and Swarm mode. |
| `site-src/assets/site.css` | **EDIT.** Three additions: (1) `.trackdag-svg .wf-*` class block immediately after `.fanmerge-svg .fm-caption` rule at line ~2244; (2) update `.concepts.is-row` rule at line 854 from current `grid-template-columns: none; grid-template-rows: repeat(3, auto)` to the 2+1 grid; add the `.concepts.is-row .concept:nth-child(3)` span rule; add the responsive override at the `@media (max-width: 900px)` block at line 2717; (3) `.concept-readmore` class block. |
| `site-src/index.njk` | **EDIT.** §I concept 03 block at lines 104-112: tighten body copy, keep chip strip, add `.concept-readmore` link below chips. No other edits to index.njk. |

Files NOT touched by craft:
- `site-src/swarm.njk`, `hooks.njk`, `memory.njk`, `cli.njk`, `install.njk`, `skills/*.njk` (all out of scope).
- `site-src/_includes/sidebar.njk` (auto-handles new entry via existing nav.json wiring).
- `site-src/_includes/topnav.njk` (auto-handles new entry via existing nav.json wiring).
- `site-src/_layouts/*.njk` (no layout changes).
- `site-src/_data/baseline.json` (counts unchanged; no addition).
- Any file outside `site-src/`.

---

## Part H — Open questions for ask-mode gate

design-ui should surface these to the user before craft runs:

1. **Selected Path for §I: Path 1** (2+1 within `.concepts.is-row`). Confirm or override to Path 2 (split section) or Path 3 (bento-style).
2. **Trimmed body copy for Concept 03** (Part E): the brief proposes a 3-sentence trim from the current 8-sentence body. Confirm or specify alternative.
3. **TOC depth on `/workflows/` page**: the proposed `toc[]` has 5 top-level entries + 3 sub-entries (`lvl: 3`). Confirm or simplify.
4. **`/init-project doctor` content depth**: Section §IV.doctor is short (one paragraph). Acceptable, or should the doctor get its own §V (cleaner separation, longer page)?

These are the four points where the brief made a judgment call. Craft proceeds on the brief's choices unless the user overrides at the ask-mode gate.

---

## Approval gate

Selected Path for §I: **Path 1** (2+1 within `.concepts.is-row`, with concept 03 spanning both columns as the hero panel). Awaiting user approval at the design-ui ask-mode gate before craft runs.
