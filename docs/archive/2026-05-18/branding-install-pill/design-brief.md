# Design brief — `branding-install-pill`

Two surfaces, one bounded pass. Header byline + new low-noise install-command pill. Register: brand. Theme: established light theme (paper background, ink text). Dark terminal-styled inclusions (`.dev-console`, `.cli-strip`) already exist for "this is something you paste in your terminal" content; the new pill inherits that visual language at a compact scale.

This brief is the input to the chore phase's implementer (main-context Edit + Write). No `craft` step runs — chore implements directly from this brief.

## 1. Feature summary

**Surface A — Header byline.** The header chip currently reads `● baseline` (or `● baseline / docs` on doc pages). We attach the attribution "by friedbotstudio" so it reads `● baseline · by friedbotstudio` (and on docs pages: `● baseline · by friedbotstudio / docs`). Brand stays primary; byline is secondary.

**Surface B — Install-command pill.** A new reusable component renders the canonical install command `npx @friedbotstudio/create-baseline@latest .` as a compact, copyable pill. It sits near other content (homepage hero, install-page top) without competing with the existing loud `.cli-strip` CTA that lives above the footer. Click copies the command; brief "copied" feedback. Low-noise via scale (small pill, max-content width), not via color suppression.

## 2. Primary user action

- **Header byline**: read-only acknowledgement of authorship. No interaction.
- **Install pill**: one click, command on clipboard, into the terminal. The fastest path from "I want this" to "I'm installing."

## 3. Design direction

- **Color strategy**: Restrained, register-aligned. Reuse existing tokens — no new color introductions.
- **Theme**: stays inside the established light theme. The pill is a dark inclusion the same way `.dev-console` and `.cli-strip` already are.
- **Scene sentence**: *A staff engineer at 11pm decides in 30 seconds whether this baseline is worth installing. They scan the homepage, see the command, click it once, paste it into their terminal, and the install runs.* The sentence forces: visibility from a passive scan, single-click affordance, no friction.
- **Anchor references**: npm package-page install snippet (compact, monospaced, single-click copy), Vercel docs hero install pill (dark inclusion in a light layout), GitHub README inline `<code>` with copy button (subtle affordance, no shouting).

## 4. Scope

- **Fidelity**: production-ready.
- **Breadth**: one component file + one byline span + three template insertions.
- **Interactivity**: click-to-copy via the existing `[data-copy]` handler at `site-src/assets/site.js:244`. No new JS.
- **Time intent**: ships in this chore.

## 5. Layout strategy

### Header byline

Visual hierarchy inside the brand chip, left-to-right:

```
[dot] baseline     · by friedbotstudio     / docs
^^^^^^^^^^^^^^     ^^^^^^^^^^^^^^^^^^^     ^^^^^^^
primary            secondary               crumb (existing .sub)
ink, weight 500    muted, weight 400       muted, existing styling
```

The byline span sits BETWEEN the existing brand text node and the optional `.sub` crumb. Same baseline, same font-size (no scale shift — scale shifts here would break the chip rhythm). Weight steps down (500 → 400) and color steps down (`var(--ink)` → muted neutral) to establish hierarchy.

### Install pill

Single-line horizontal layout:

```
┌─────────────────────────────────────────────────┐
│ $  npx @friedbotstudio/create-baseline@latest . ⧉ │
└─────────────────────────────────────────────────┘
  ^   ^                                            ^
  prompt  command                              copy-icon
  muted   default code-fg                      muted; brightens on hover
```

On copied (`.is-copied` class applied by existing JS for ~1.5s):

```
┌─────────────────────────────────────────────────┐
│ $  npx @friedbotstudio/create-baseline@latest . ✓ │
└─────────────────────────────────────────────────┘
  border-tinted-accent           icon swaps to check
```

No motion on the command text itself. The only visual change between default and copied is the icon swap + a tiny border-color step toward the accent.

## 6. Key states

### Header byline

| State | Treatment |
|---|---|
| Default (≥ 720px) | Visible; muted weight + color (see token table) |
| Compact (< 720px) | Hidden via `display: none` (the primary nav also collapses around the same point) |
| On docs pages | Renders identically; the existing `.sub` crumb sits to the right |
| `.brand:hover` | No change to byline — the existing `.brand:hover` rule already targets `var(--ink)`; the byline stays muted regardless |

### Install pill

| State | Treatment |
|---|---|
| Default | Dark bg, muted prompt, default code-fg command, muted copy icon |
| `:hover` | Background brightens one step; copy icon opacity 0.55 → 0.85; transition 200ms ease-out-quart |
| `:focus-visible` | 2px solid `var(--accent)` outline, 2px offset (matches site focus convention at line 110 of site.css) |
| `:active` | `transform: translateY(1px)` (no scale change, no shadow change) |
| `.is-copied` (1.5s) | Border becomes 1px solid `var(--accent-light)` at ~60% opacity OR a subtle border-color step toward accent; `.ip-copy` icon fades out (opacity 0); `.ip-check` icon fades in (opacity 1); `aria-live` status span text becomes "Copied" |
| `prefers-reduced-motion: reduce` | All `transition` and `transform` rules nulled; instant state swaps only; the icon swap is still instant (no fade) |
| Narrow viewport (< 640px) | Pill becomes `width: 100%`; `.ip-cmd` truncates with `text-overflow: ellipsis`; `data-copy` still carries the full command so click still copies the full string |

## 7. Interaction model

Pill is a `<button>` element. Existing `[data-copy]` handler at `site-src/assets/site.js:244` reads `btn.getAttribute("data-copy")`, calls `navigator.clipboard.writeText(...)`, adds the `.is-copied` class on success, removes it after ~1.5s. No new JS required.

Keyboard: tab to focus, Enter or Space to activate. The focus ring uses the site's existing focus convention so it's familiar.

Screen readers: `aria-label="Copy install command to clipboard"` on the button; the `aria-live="polite"` status span announces "Copied" when the class flips.

## 8. Content requirements

| String | Source | Where |
|---|---|---|
| `by friedbotstudio` | new `site.byline` field in `site-src/_data/site.cjs` | rendered by `topnav.njk` as `{{ site.byline }}` |
| `·` separator (U+00B7 MIDDLE DOT) | inline in `topnav.njk` | between brand and byline; surrounded by ` ` (single non-breaking would also be valid but a regular space is fine) |
| `npx @friedbotstudio/create-baseline@latest .` | inline in `install-pill.njk` (single canonical command, not parameterized) | the pill's `data-copy` + visible `.ip-cmd` text |
| `$` prompt prefix | inline in `install-pill.njk` | the `.ip-prompt` span, `aria-hidden="true"` |
| `Copy install command to clipboard` | inline in `install-pill.njk` | the `aria-label` |
| `Copied` | inline in `install-pill.njk` (default-state hint span uses `aria-live`) | OR follow the existing `.cli-strip` pattern at `site-src/index.njk:557` with `data-default="..." data-copied="..."` if the JS supports it |

Article X.1 register applies: no em dashes anywhere in user-facing copy. The middle dot `·` and the word `by` are the only joiners used here.

## 9. Token table

### Header byline (CSS values, inline or new tokens)

| Property | Value | Token if exists |
|---|---|---|
| Color | `oklch(50% 0 0)` — muted neutral, clearly secondary against `--ink` (oklch 15%) | reuse `--code-fg-prompt` (oklch 60% 0 0) if a step lighter reads right; otherwise add `--ink-mute: oklch(50% 0 0)` to `:root` |
| Weight | `400` (regular) | brand text is the heavier comparison; no need to name a token |
| Size | inherit (same as `.brand` text) | — |
| Margin | `margin-left: 0.5em` from brand, `margin-right: 0.5em` to `.sub` (or use the separator's own spacing) | — |
| Separator char | `·` (U+00B7), rendered as part of the byline span text content with single spaces: `" · by friedbotstudio"` | — |
| Hide breakpoint | `@media (max-width: 720px) { .byline { display: none; } }` | verify against the existing primary-nav collapse breakpoint in `site.css` line 305 area; align with it if it differs |

### Install pill (CSS values, mostly reusing existing tokens)

| Property | Value |
|---|---|
| Background | `var(--ink)` (oklch 15% 0 0) — matches `.dev-console` / `.cli-strip` dark surface |
| Hover background | `oklch(20% 0 0)` — one step lighter than `--ink`; consider adding `--ink-elevated` if a clean token feels right |
| Text color | `var(--code-fg-default)` (oklch 88% 0 0) |
| Prompt `$` color | `var(--code-fg-prompt)` (oklch 60% 0 0) |
| Icon color | `currentColor` with `opacity: 0.55` default, `0.85` on hover, `1` in `.is-copied` |
| Border | `1px solid transparent` default; `1px solid var(--accent-light)` at 0.6 opacity in `.is-copied` |
| Border radius | `10px` (rounded rect — calmer than a true pill for a dev-tool aesthetic) |
| Padding | `8px 12px` |
| Gap (inline-flex) | `10px` between `.ip-prompt`, `.ip-cmd`, and the icon |
| Font family | `ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace` — match site's existing mono stack |
| Font size | `13px` |
| Line height | `1.4` |
| Display | `inline-flex; align-items: center` |
| Width | `width: max-content; max-width: 100%` |
| Cursor | `pointer` |
| Transition | `background-color 200ms cubic-bezier(0.22, 1, 0.36, 1), border-color 200ms cubic-bezier(0.22, 1, 0.36, 1)` (ease-out-quart; no transform transitions) |
| Active transform | `transform: translateY(1px)` (no transition needed; instant) |
| Focus ring | `outline: 2px solid var(--accent); outline-offset: 2px` (matches site convention) |
| Reduced motion | `@media (prefers-reduced-motion: reduce)` blanks `transition` and `transform` |
| Narrow viewport | `@media (max-width: 640px)` sets `width: 100%`; `.ip-cmd` gets `min-width: 0; flex: 1; text-overflow: ellipsis; overflow: hidden; white-space: nowrap` |

## 10. Anatomy and HTML attribute spec

### Header byline (insertion inside `site-src/_includes/topnav.njk`)

The existing `.brand` anchor renders:

```html
<a class="brand" href="…"><span class="dot"></span><span>{{ site.brand }}</span>{% if subtitle %}<span class="sub">{{ subtitle }}</span>{% endif %}</a>
```

Add a new span between the brand text and the optional `.sub`:

```html
<a class="brand" href="…">
  <span class="dot"></span>
  <span>{{ site.brand }}</span>
  {%- if site.byline %}<span class="byline">· {{ site.byline }}</span>{% endif %}
  {%- if subtitle %}<span class="sub">{{ subtitle }}</span>{% endif %}
</a>
```

The byline is opt-in via `site.byline` so removing the field cleanly removes the byline without template changes.

`site-src/_data/site.cjs` adds one field:

```
byline: 'by friedbotstudio'
```

### Install pill (new partial `site-src/_includes/install-pill.njk`)

Complete element:

```html
<button class="install-pill" type="button"
        data-copy="npx @friedbotstudio/create-baseline@latest ."
        aria-label="Copy install command to clipboard">
  <span class="ip-prompt" aria-hidden="true">$</span>
  <span class="ip-cmd">npx @friedbotstudio/create-baseline@latest .</span>
  <svg class="ip-icon ip-copy" aria-hidden="true" viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <rect x="5" y="5" width="9" height="9" rx="1.5"/>
    <path d="M3 11V3.5C3 2.7 3.7 2 4.5 2H11"/>
  </svg>
  <svg class="ip-icon ip-check" aria-hidden="true" viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M3 8.5 L6.5 12 L13 4.5"/>
  </svg>
  <span class="ip-status visually-hidden" aria-live="polite"></span>
</button>
```

Default visibility: `.ip-copy` shown, `.ip-check` hidden. On `.is-copied`: `.ip-copy` hidden, `.ip-check` shown.

Notes:
- Use `type="button"` to ensure the button is never treated as a form submit if the pill ever lands inside a form.
- The check SVG path mirrors the existing `.cli-check` path in `index.njk:555` for visual consistency.
- The `.ip-status` span starts empty; the existing JS at `site-src/assets/site.js:244` flips class but does NOT currently write to a status node. Implementer choice: either (a) extend the handler to update an `[aria-live]` sibling, or (b) follow the existing `.cli-strip` pattern with `data-default` / `data-copied` attributes on a `.ip-hint` element. Recommendation: option (b) for minimum-change-to-JS and consistency with `.cli-strip`.

## 11. Placement specs

| # | File | Region | Surrounding | Anchor |
|---|---|---|---|---|
| 1 | `site-src/index.njk` | Inside `.hero > .hero-grid > .hero-content` | After the existing `.lead` paragraph, BEFORE the `.ctas` div | Lines around 15–16 |
| 2 | `site-src/install.njk` | Top of the file body | After the YAML frontmatter (line 20), BEFORE the first `<section class="section">` at line 22 | Insert immediately as the first content element |
| 3 | `site-src/_includes/install-pill.njk` | NEW partial — defines the component | n/a | n/a |

Placement 1 alignment: left-aligned (matches the rest of `.hero-content`). Margin: `margin: 8px 0 24px` (small top gap from the lead, larger bottom gap before the CTAs so the pill reads as a continuation of the lead rather than a competing CTA).

Placement 2 alignment: left-aligned matching the docs content column. Margin: `margin: 12px 0 32px` (a touch more breathing room below since the next element is a section heading).

**Other surfaces considered and explicitly NOT recommended:**
- CLI page (`site-src/cli.njk`): the page is already saturated with command examples in `<pre>` blocks. Adding a pill would compete with them rather than help. Skip.
- FAQ: not an install context. Skip.
- 404 / error pages: not an install context. Skip.

Two placements is the right answer. Three+ risks "command soup."

## 12. What stays unchanged

The existing `.cli-strip` at `site-src/index.njk:550-558` SHALL NOT be modified. It earns its loudness as the final-CTA strip above the footer — that's its job. The new install-pill is a quieter cousin for header-adjacent and page-top contexts; the two coexist by virtue of (a) different scale, (b) different placement context, (c) one being the canonical "ship CTA" and the other being a passive copy affordance.

The existing `[data-copy]` JS handler at `site-src/assets/site.js:244` SHALL NOT be modified for the core copy behaviour. If implementer chooses option (b) above (data-default/data-copied pattern), the existing handler already covers it — it reads `.cli-strip [data-default]` / `[data-copied]` attributes; the same selector pattern works for `.install-pill .ip-hint` once added.

The existing `.cli-strip` CSS at `site-src/assets/site.css:1554` block SHALL NOT be modified. New `.install-pill` styles live in their own block, ideally adjacent so future readers find both terminal-styled components in one neighborhood.

## 13. Anti-patterns

- ❌ Animating the command text on hover (shimmer, scroll, color cycle). Text stays still — only the icon affordance + border respond.
- ❌ Showing a tooltip on hover that says "Click to copy." The copy icon IS the affordance.
- ❌ Making the pill `width: 100%` on desktop. It should be sized to the command (max-content) so it reads as inline, not as a CTA bar.
- ❌ Replacing the existing `.cli-strip` with the pill. They serve different jobs.
- ❌ Putting the pill ABOVE the lead/eyebrow on the homepage. The lead establishes context first; the pill is the action.
- ❌ Adding a second install-pill anywhere within the same viewport as a visible `.cli-strip`. One copy affordance per visible region.
- ❌ Rendering the byline at a different font scale than the brand. Same scale, different weight + color.
- ❌ Hardcoding `by friedbotstudio` in the template. Route through `site.byline` so the brand identity stays centralized.

## 14. Recommended impeccable references for implementation (informational)

The chore implementer is writing production Nunjucks + CSS directly without running `craft`. For their reference if anything visual feels uncertain:

- `reference/layout.md` — rhythm and spacing decisions.
- `reference/typeset.md` — type-system consistency.
- `reference/audit.md` — checks the implementer can self-run before declaring done (a11y, responsive).

## 15. Open questions

1. The existing primary-nav collapse breakpoint in `site-src/assets/site.css` should govern the byline's hide breakpoint. Implementer SHOULD locate that `@media (max-width: …)` rule and align the byline hide breakpoint with it. If the nav collapses at a different value than the suggested 720px, the byline's `display: none` rule SHALL use whichever value the nav actually uses. **Default if unresolved: 720px.**
2. The "copied" status announcement to assistive tech: option (a) extend JS, option (b) follow `.cli-strip`'s `data-default` / `data-copied` pattern. **Default: option (b)** — minimum JS change, consistency.

Both questions are implementation choices the chore can resolve during the edit step without re-running shape.

---

**Brief complete.** Hand back to design-ui for state persistence and Report; chore main-context implements from this brief.
