# Three-area review

Scoped critique of three discrete surfaces: topnav brand chip, hero "read the docs" link, and the install.njk page as a whole. Output is proposals; user picks per area; main-context implements.

---

## AREA 1 — Topnav brand section

### Findings

**F1.1 — Dot pulse risks becoming wallpaper.** `site-src/assets/site.css:241-258` — `.brand .dot` runs `brand-dot-pulse 2.6s cubic-bezier(.4, 0, .2, 1) infinite`. The 2.6s cadence is fast enough to register as constant motion in peripheral vision for the duration of a session. Infinite-animating decorative dots is a recognized SaaS reflex; the visitor's brain learns to ignore it within ~30s, after which it's pure visual cost (paint, motion-budget) with zero communicative value. The pulse earned its place at first paint; it doesn't earn it forever.

**F1.2 — Chip is dense but coherent.** `site-src/_includes/topnav.njk:11` renders 4 inline elements: dot + brand text + byline + sub crumb. On desktop the chip reads `● baseline · by friedbotstudio / v0.3` which is information-rich. The 720px breakpoint already drops the byline; the slug already drops at 640px. The density is intentional and the breakpoint cascade is right.

**F1.3 — `.gh-link` repo slug carries weight that could shift.** `site-src/_includes/topnav.njk:19-24` + `site-src/assets/site.css:270-308` — the GitHub link renders an 18×18 icon + the text "friedbotstudio/baseline". On 1024px+ this reads fine. The slug duplicates information already in `aria-label` and `title`, and a savvy visitor reads "github.com" from icon shape alone. The slug isn't broken; it's just doing redundant work. Trim possible, not required.

**F1.4 — Mobile shape is already clean.** Below 640px, `.gh-repo` hides and the byline hides. At < 720px the primary nav also collapses (line 2485). The mobile chip reads `● baseline / docs` + icon. Nothing to do.

### Options

| # | Move | Cost | P |
|---|---|---|---|
| 1A | Slow the dot pulse from 2.6s to 5–6s OR make it a one-shot 3-cycle animation that stops. Change `animation: brand-dot-pulse 2.6s ... infinite` to `5.2s ... infinite` (slower heartbeat) OR `2.6s ... 3` (three cycles then settle). 1-line change. | ~1 LOC | **P1** |
| 1B | Icon-only `.gh-link` on the full-width header at ≥ 720px; reveal slug on focus/hover instead of as default. Touches `.gh-link .gh-repo { display: none; }` + a `:hover/:focus-within` override. ~6 LOC. | ~6 LOC | P3 |
| 1C | Restructure the chip as two-line: brand on top, byline + sub stacked beneath as mono caption. Distinctive but adds vertical chrome to a 64px-tall sticky bar — header height grows. Not worth the cost. | ~25 LOC | P3 (skip) |

### Ship-one verdict — Area 1

**1A — slow the dot pulse.** Specifically, switch to a one-shot 3-cycle stop: the dot pulses three times after page load to communicate "live", then settles. Removes the wallpaper effect, keeps the gesture. One-line CSS change.

---

## AREA 2 — "or read the docs →" link

### Findings

**F2.1 — Destination `/swarm/` is non-obvious for "read the docs."** `site-src/index.njk:20` — the link points at `/swarm/`, which is the most architecturally narrative doc but also the deepest. A visitor clicking "read the docs" expects an entry point, not a feature-specific deep-dive. The hooks page (`/hooks/`) is the most concrete "what is this baseline DOING" answer and is the natural read-first destination for evaluators.

**F2.2 — Copy is honest, slightly generic.** "or read the docs →" works. It says what it does, in a register-correct lowercase, with a navigation cue. Slightly more specific alternatives: "or read what it does →" (concrete), "or see how it works →" (peek-behind-curtain). The current copy is fine; sharpening it is optional.

**F2.3 — Position is correct.** Between pill and meta-strip is the right slot — soft alternate between primary action and proof points. No move needed.

**F2.4 — Visual treatment is appropriate for the register.** Mono 13px muted with arrow-on-hover animation. Matches PRODUCT.md's "quiet authority." No additional underline / dot prefix / accent needed.

### Options

| # | Move | Cost | P |
|---|---|---|---|
| 2A | Re-target the link from `/swarm/` to `/hooks/`. One-line `href` change in `index.njk:20`. | ~1 LOC | **P1** |
| 2B | Sharpen the copy: `or read what it does →` (concrete) or `or see how it works →` (peek-behind-curtain). Single-line text edit. | ~1 LOC | P2 |
| 2C | Keep both moves — re-target AND sharpen copy. `or read what it does →` linking to `/hooks/`. | ~2 LOC | P1 (compound) |

### Ship-one verdict — Area 2

**2C — re-target AND sharpen copy.** Change `index.njk:20` to:

```html
<a data-cta="read-the-docs" href="{{ '/hooks/' | rel }}">or read what it does <span class="arr">→</span></a>
```

Single edit, two improvements compounding. The link now points at the most concrete doc and the copy says what the visitor will actually find there.

---

## AREA 3 — install.njk page review

### Findings

**F3.1 — Pill at top duplicates command from § II partly, but defensibly.** `site-src/install.njk:23` (pill: `npx @friedbotstudio/create-baseline@latest .`) and lines 61-67 (pre block: `npx ... ./my-project --dry-run` then `npx ... ./my-project`). Different invocations — pill is "install to current dir, latest", pre block teaches "use --dry-run to preview, then a named target". The audiences are different: pill is for "I just want to install"; pre block is for "I'm reading to evaluate." Defensible redundancy. Two notes worth surfacing:
- The pill uses `.` (current directory) while the pre block uses `./my-project`. Most readers will reconcile this; some won't immediately register that both are valid.
- The pill says `@latest`, the pre block doesn't pin a version (also `@latest` implicit). Consistent.

**F3.2 — Section flow is correct for first-timer; sidebar TOC handles recovery user.** Requirements → One command → What lands → After install → Recover is the canonical install-page order. The sidebar TOC exposes Recover at any time so a recovery-mode user can jump directly. No structural fix.

**F3.3 — `@clack/prompts` mention is misplaced.** `site-src/install.njk:33` — the Requirements lede ends with "The CLI ships one pinned runtime dependency, `@clack/prompts`, which supplies the prompt primitives behind the branded TTY flows." This is dependency-footprint info, not a requirement. It belongs in § III "What lands" (which IS about what the install brings in) or in its own micro-note about dependency footprint. As-is, a reader scanning Requirements expects "what do I need installed before I run this" and gets a sentence about what the CLI itself contains.

**F3.4 — "What lands" table is strong but flat.** `site-src/install.njk:89-100` — a 7-row table of path + role. Comprehensive and accurate. A file-tree visualization (project root with NEW markers on the sentinel paths) would be more memorable for the 30-second scanner, but the table is correct and reference-friendly. The current treatment serves the reference-reader well; a tree would serve the evaluator better. Trade-off.

**F3.5 — Recover section is solid.** `site-src/install.njk:129-158` — 3 situations × 3 columns (Situation, Command, Effect). Each row is self-contained and actionable. Good as-is.

### Options

| # | Move | Cost | P |
|---|---|---|---|
| 3A | Relocate the `@clack/prompts` sentence from the Requirements lede (line 33) to § III "What lands" (after the table at line 100) as a one-line dependency-footprint note: "One pinned runtime dependency ships with the CLI: `@clack/prompts`, which supplies the prompt primitives behind the branded TTY flows." Cleans up Requirements and puts the info where it logically belongs. | ~4 LOC (move only) | **P1** |
| 3B | Add a small "file-tree" visualization to § III "What lands" alongside or replacing the table. ASCII art in a `<pre>` showing a representative project root with the 4 sentinel paths marked NEW. Stronger evaluator answer but ~30 LOC of careful layout + CSS for monospace + arrow markers. | ~30 LOC | P3 |
| 3C | Add an "Already installed?" sub-eyebrow at the very top of the page (above the pill) with a small text link to #recover for users in panic mode. Single line, may shave 5-10s off the recovery-user's experience. | ~3 LOC | P3 |

### Ship-one verdict — Area 3

**3A — relocate `@clack/prompts` to § III.** It's the most meaningful structural cleanup, takes <5 lines of editing, and improves the information architecture without adding scope. The page is otherwise in good shape; nothing else here is broken enough to fix in this pass.

If you want a second move from this area, **3B (file-tree visualization)** is the stretch goal — but it's a separate workflow's worth of design work, not a chore-track edit.

---

## Combined recommendation

If you ship one move per area:

1. **Area 1** → slow the dot pulse to 3-cycle one-shot (~1 LOC)
2. **Area 2** → re-target to `/hooks/` + sharpen copy to "or read what it does →" (~2 LOC)
3. **Area 3** → relocate `@clack/prompts` mention from § I to § III (~4 LOC)

Total: ~7 LOC of changes, three small information-architecture and motion-budget fixes that compound. None of them are bold; all of them are right.
