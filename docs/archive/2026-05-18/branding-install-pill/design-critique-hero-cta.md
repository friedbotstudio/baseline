# Focused critique — Homepage hero `.ctas` after option (b)

Scope: only the `.ctas` div with its lone `.btn-secondary "Read the docs"` button, now that the primary "Get the baseline →" CTA has been removed. Not the pill, not the byline, not the broader hero.

## Current state (relevant lines)

`site-src/index.njk:12-26`:

```
.hero-content
├── .eyebrow         (line 13)
├── h1               (line 14)
├── .lead            (line 15, ~21px font, max-width 640px, mb-40)
├── .hero-install    (lines 16-18, mt-8 / mb-24, contains the dark pill)
├── .ctas            (lines 19-21, gap-12 flex, mb-56) — NOW ONE CHILD
│   └── .btn-secondary "Read the docs" → /swarm/
└── .meta-strip      (5 stats, mt-56)
```

`site-src/assets/site.css:570-575` — `.ctas` is `display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 56px;`. Designed for ≥ 2 buttons; with one child the gap is unused and the `flex-wrap` is irrelevant.

`site-src/assets/site.css:371-379` — `.btn-secondary` is `color: var(--ink); border-color: var(--rule); background: var(--paper);` — outlined, paper-white, dark text. Standard secondary affordance.

## Verdicts (heuristic-by-heuristic, focused only on this region)

### Visual balance — **P2 imbalance**

- **Evidence**: `site-src/index.njk:19-21` — `.ctas` flex container, 12px gap, wraps. With one child the gap and wrap are dead. The button is sized to its content (~140px wide) and sits hard-left in a wide container; the rest of that horizontal slot is empty.
- **Verdict**: orphaned. The container's empty-right space communicates "I expected another button" — which is exactly what just got removed.
- **Consider**: either drop the `.ctas` wrapper (no container with one item) or replace the lone button with something that doesn't look like a button (text link, inline action).

### Hierarchy clarity — **P3 OK by accident**

- **Evidence**: `site-src/index.njk:17` (pill, dark `.code-bg` surface, mono command) vs. `site-src/index.njk:20` (button, paper-white surface, display font).
- **Verdict**: the pill's command-text content is unmistakably the action. The button reads as alternate. So even with the pill above being darker than the secondary button, the hierarchy survives. This isn't ambiguous — the lone-button-as-secondary works because the visible content of the pill IS the install action; users don't need the button to be a "stronger" colour to understand the order.
- **Consider**: leave hierarchy alone. The remaining issue is balance, not hierarchy.

### Information architecture — **P3 questionable target**

- **Evidence**: `site-src/index.njk:20` — `href="{{ '/swarm/' | rel }}"`. /swarm/ is one of six doc pages.
- **Verdict**: why /swarm/? It's a deeply-narrative doc, but a visitor who clicks "Read the docs" expecting a doc home will land in the middle of the deepest doc — surprising. The primary nav has explicit Hooks / Memory / Swarm / Skills / CLI links and Overview at `/`; a "Read the docs" link could land on Overview (which already IS the homepage) — circular. Or on a `/docs/` index — which doesn't exist.
- **Consider**: if the button stays, point it at a doc-overview destination. Better: remove it (the primary nav already exposes every doc page).

### Redundancy with primary nav — **P2 duplicative**

- **Evidence**: `site-src/_data/nav.json` lines 3-9 — primary nav has Overview / Hooks / Memory / Swarm / Skills / CLI, rendered into the sticky header on every page (`topnav.njk` line 13-17).
- **Verdict**: The hero "Read the docs" button is a single click target for browsing docs, when the primary nav above it offers six. For PRODUCT.md's senior-engineer audience — who already use the primary nav reflexively — the hero CTA is a duplicate affordance with a less-good target.
- **Consider**: the CTA earned its place when paired with "Get the baseline →" as the "or read first" alternate; alone, it doesn't add anything the nav doesn't.

### Visual rhythm — **P2 monotonous stack**

- **Evidence**: pill is ~36–38px tall, dark, mono. Button is ~40px tall, light, display font. Both pill-shaped. Stacked vertically with 24px between them (from `.hero-install mb`), then 56px to the meta-strip.
- **Verdict**: two same-mass elements in a vertical column with similar heights reads as monotony, not rhythm. The hero's variety (eyebrow 13px / H1 huge / lead 21px) ends abruptly when pill and button arrive both around 38–40px tall.
- **Consider**: reintroduce rhythm. Either (a) make the secondary affordance smaller (text link), (b) make it side-by-side with the pill (horizontal pair), or (c) remove it entirely so the pill stands alone before the meta-strip.

### Mobile — **P3 worse, same shape**

- **Evidence**: `.ctas` keeps `flex-wrap: wrap`; one button doesn't wrap. At narrow viewports the button is ~140px wide on the left; the page narrows but the orphan looks more pronounced because there's less surrounding content.
- **Verdict**: the desktop imbalance persists on mobile, slightly amplified.
- **Consider**: same fixes; whatever resolves desktop resolves mobile.

## Priority issues (consolidated)

1. **[P2] Orphan secondary button.** The lone button in a flex container designed for ≥ 2 children reads as missing something. Visible imbalance.
2. **[P2] Duplicative with primary nav.** Six doc links in the sticky header above; a single "Read the docs" hero CTA pointing to one of them doesn't earn its place anymore.
3. **[P2 / P3] Rhythm flattening.** Two similar-mass elements stacked vertically dampens the hero's typographic energy.

## Options for resolution

### Option A — **Remove the `.ctas` entirely**

The pill is the action. The primary nav handles navigation. The meta-strip provides proof. Strip the secondary affordance from the hero.

**Change**: delete lines 19-21 of `site-src/index.njk`. The hero stack becomes: eyebrow → H1 → lead → install pill → meta-strip.

**Pros**:
- Cleanest. Hero gains focus — one action, one set of proof points.
- Resolves orphan-ness, redundancy, and rhythm in one move.
- Less code.

**Cons**:
- A visitor who wants to "read first" must scroll up to the primary nav OR jump to a section below. (Senior engineers will; first-timers maybe not.)
- Lose an explicit "read mode" affordance.

**Spacing nuance**: `.hero-install` is currently `margin: 8px 0 24px` (24px bottom toward .ctas) and `.meta-strip` has `margin-top: 56px`. Without `.ctas` in between, the gap between pill and meta-strip is 24 + 56 = 80px. That's appropriate — generous breathing room before proof points. Could fine-tune to 60-72px if it feels too much.

### Option B — **Demote button to a text link** *(recommended)*

Replace the button with a subtle inline text link below the pill: `Or read the docs →`. Same destination concern (re-targets to a sensible page).

**Change**:
- `site-src/index.njk:19-21` — replace `.ctas + .btn-secondary` with a small inline element (link, not button).
- Optional: target `/swarm/` → `/overview/` (which is `/`, the homepage) → no, doesn't work. Better: pick the canonical "first read" doc. The narrative doc is `/swarm/`; the conceptual one is the homepage itself; the install one is `/install/`. Pick `/swarm/` (status quo) or rethink the target.
- Small CSS: a `.hero-readmore` class (8-12 lines) — display block or inline-block, mono or display font small (~13-14px), muted color, arrow that animates on hover like `.btn .arr`. Adjacent to the pill (~8px below).

**Pros**:
- Resolves orphan AND rhythm in one move — text link is visibly subordinate to the pill.
- Keeps the "read first" affordance for evaluators who want context.
- Matches PRODUCT.md's "quiet authority" voice.
- 5-min implementation.

**Cons**:
- Doesn't resolve the "redundant with primary nav" concern — the link is still there, just quieter.
- Picks a single target (/swarm/) — slight arbitrariness.

**Suggested target**: keep `/swarm/` (narrative starting point) OR re-anchor to a future `/docs/` index. Don't link to `/install/` — that's what the pill leads to.

### Option C — **Side-by-side pair: pill + button on one row**

Wrap pill + button in a horizontal flex group so they sit together at desktop widths.

**Change**:
- `site-src/index.njk` — wrap pill and button in a new `<div class="hero-action-row">` flex container.
- New CSS: `.hero-action-row { display: flex; gap: 16px; align-items: center; flex-wrap: wrap; margin: 8px 0 32px; }`. Drop `.hero-install` and `.ctas` margins.

**Pros**:
- Visually balanced row — primary action + alternate as siblings.
- Resolves rhythm — the row reads as one composed unit instead of two stacked elements.

**Cons**:
- Pill is wide (mono command ~430px) plus button (~140px) plus 16px gap = ~590px. Fits on most desktop hero columns (~620px) but tight.
- Mobile wraps to vertical stack, recreating the original imbalance below 640px.
- More layout work + a new component class.

### Option D — **Remove `.ctas` AND tighten meta-strip rhythm**

A variant of Option A: in addition to removing the lone button, slightly reduce `.meta-strip { margin-top: 56px }` to ~36-40px so the pill → meta-strip gap doesn't feel like the button used to be there.

**Pros**: belt-and-braces Option A. Hero rhythm tightens overall.
**Cons**: changes a token that affects every page using `.hero` (only homepage right now, but worth noting).

## Recommendation

**Option B (text link).** It's the move most aligned with the brand register: low-noise, low-decoration, intentional. It resolves the orphan AND the rhythm in one change. It keeps the "read first" affordance for the small fraction of evaluators who want it.

If you want maximum cleanliness and trust the primary nav to handle navigation, **Option A** is also defensible — and shorter.

**Option C** is the most ambitious but introduces mobile wrapping that recreates the imbalance — not worth the complexity for this surface.

If you pick B, suggested copy:

- `or browse the docs →` (matches the lowercase, muted register of the hero's eyebrow + lead)
- `or read the docs →` (more imperative)
- `still want to evaluate first? read the docs →` (longer, more guided — probably too long)

If you pick A, no copy decision needed.

Tell me which option (A or B), and if B which copy line.
