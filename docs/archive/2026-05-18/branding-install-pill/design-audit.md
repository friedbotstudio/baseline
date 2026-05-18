# Audit report — `branding-install-pill`

`$impeccable audit` run against the just-shipped header byline + install-pill component. Read-only; findings only, no fixes applied.

## Audit Health Score

| # | Dimension | Score | Key finding |
|---|---|---|---|
| 1 | Accessibility | 3 | No SR announcement on copy; touch target ~34px tall (passes AA, fails AAA) |
| 2 | Performance | 4 | Transitions only on `background-color` / `border-color` / `opacity` / `transform`; reduced-motion paths present |
| 3 | Theming | 4 | All values via CSS custom props; no hardcoded oklch literals |
| 4 | Responsive | 2 | **Byline missing hide-breakpoint rule** — will overflow header on viewports < 720px |
| 5 | Anti-patterns | 4 | No AI tells; restrained, intentional, matches established site language |
| **Total** |  | **17/20** | **Good** (one P1 to fix; rest is polish) |

Without the responsive bug → 19/20 Excellent.

## Anti-patterns verdict

**Pass.** Specifically checked against the shared bans:

- Side-stripe borders > 1px: none.
- Gradient text: none.
- Glassmorphism: none.
- Hero-metric template: not applicable.
- Identical card grids: not applicable.
- Modal-first thinking: not applicable.
- Em dashes in user-facing copy: byline uses `·`; pill copy is the literal command. Compliant with Article X.1.
- AI category-reflex: no — pill is a code-tag affordance, not a generic "install button"; treatment is restrained-by-scale, not by color suppression.

## Executive summary

- **Score**: 17/20 (Good).
- **Severity counts**: P0=0, P1=1, P2=2, P3=1.
- **Top issue**: Byline lacks a `@media (max-width: 720px) { display: none }` rule despite the brief specifying it. On narrow viewports the chip will overflow the header. Fix is a 3-line CSS rule.
- **Recommended next step**: Apply the P1 fix (3-line CSS), optionally consider P2.1 (touch target), then `/grant-commit`.

## Detailed findings

### [P1] Byline missing hide-breakpoint rule

- **Location**: `site-src/assets/site.css` around line 264 (end of `.brand .byline` block) — the matching `@media (max-width: 720px)` hide rule is absent.
- **Category**: Responsive.
- **Impact**: On viewports < 720px the byline ("· by friedbotstudio") stays visible inside the brand chip. Combined with `.brand` (`baseline`), `.sub` (`/ v0.3` on homepage, `/ docs` on docs pages), and the existing primary nav that *also* fails to collapse cleanly below 720px on non-docs pages, the header WILL overflow or wrap awkwardly. The brief and inline CSS comment both reference the 720px coordination, but the actual rule wasn't written.
- **WCAG/Standard**: Not strictly WCAG, but breaks 1.4.10 (reflow) on small viewports if overflow causes horizontal scroll.
- **Recommendation**: Add a media query after `.brand .byline`:
  ```css
  @media (max-width: 720px) {
    .brand .byline { display: none; }
  }
  ```
- **Suggested command**: `$impeccable adapt` (responsive fix), or just apply inline since it's 3 lines.

### [P2] No screen-reader announcement on copy success

- **Location**: `site-src/_includes/install-pill.njk` (no `aria-live` region) + the shared handler at `site-src/assets/site.js:244-271` (only flips `.is-copied` class and updates `.cli-hint` textContent).
- **Category**: Accessibility.
- **Impact**: A sighted user sees the copy icon swap to a check, an unmistakable success signal. A screen-reader user gets nothing — the SVGs are `aria-hidden="true"` (correctly), the button's `aria-label` doesn't change, and there's no `aria-live` region. So they tab to the pill, hear "Copy install command to clipboard, button", press Enter, and… silence. They may not know whether the action succeeded.
- **WCAG/Standard**: 4.1.3 (Status Messages, Level AA). A copy-to-clipboard success is a status message that should be programmatically determinable without focus change.
- **Recommendation**: Add a visually-hidden span inside the pill: `<span class="ip-status visually-hidden" aria-live="polite"></span>`, then extend the JS handler (1 line) to set its textContent to "Copied install command" on success, blank on reset. Coordinate with `.cli-strip` for consistency — the existing strip has the same gap, so this is a system-wide AA bump, not just for the pill. The site lacks a `.visually-hidden` utility class; add one to the global stylesheet at the same time.
- **Suggested command**: `$impeccable harden` (production-ready a11y pass).

### [P2] Touch target height ~34px on mobile

- **Location**: `site-src/assets/site.css:1672-1690` — pill padding `8px 12px` + 13px font × 1.4 line-height ≈ 34.2px tall.
- **Category**: Responsive / Accessibility.
- **Impact**: WCAG 2.1 AA target size (2.5.5) requires 24×24 — pill passes. WCAG AAA and Apple HIG want 44×44 — pill falls short. On a phone, a 34px-tall thumb target with a long horizontal width is usable but borderline; users with motor impairments may mistap. The pill goes `width: 100%` at < 640px, so the horizontal area is generous; only the vertical is tight.
- **WCAG/Standard**: 2.5.5 Target Size (AAA) — informational, not a P1 blocker.
- **Recommendation**: Bump padding to `10px 12px` inside the `@media (max-width: 640px)` block so the touch target lands at ~38–40px on mobile without changing the desktop compact feel. Or accept the trade-off and move on.
- **Suggested command**: `$impeccable adapt`.

### [P3] `.cli-strip` 480px media query orphaned after install-pill

- **Location**: `site-src/assets/site.css:1740-1745` — the `@media (max-width: 480px) { .cli-strip ... }` rule sits AFTER the `.install-pill` block (lines 1672–1739). The cli-strip's other media query (720px, line 1657–1665) sits BEFORE the install-pill block. The split is cosmetic — both rules apply correctly at runtime.
- **Category**: Code quality.
- **Impact**: None at runtime. A future reader looking at the cli-strip media stack has to scroll past the install-pill block. Mild grep-and-scroll friction.
- **Recommendation**: Move the 480px cli-strip media query up next to its 720px sibling (just below line 1665). Or leave it; this is true polish.
- **Suggested command**: None — manual one-shot move.

## Patterns & systemic issues

- **`.visually-hidden` utility missing.** The site has no global `.visually-hidden` (or `.sr-only`) class. The existing `.cli-strip` works around it by repurposing `.cli-hint` text content for both visible label and (implicit) status. Any future a11y improvement that needs an off-screen-but-readable element will need this utility. Add once, use widely.
- **Status announcement convention.** The existing copy-success pattern relies on visual feedback only. Two copy affordances in the system now (cli-strip + install-pill) — neither announces success programmatically. Worth a single coordinated fix.

## Positive findings

- **Token discipline**: every color, font, and motion curve goes through a CSS custom property. No hardcoded oklch literals, no rogue hex values. Re-theming would just work.
- **Motion budget**: transitions cover `background-color` / `border-color` / `opacity` only; transform used only on `:active` with no transition (snappy, no animation cost). All paths zero out under `prefers-reduced-motion: reduce`.
- **System kinship without duplication**: `.install-pill` shares the dark terminal aesthetic with `.cli-strip` but at compact scale with different anatomy (icon-swap feedback vs. caret+check) — the two coexist on the homepage as load-bearing siblings, not as duplicates begging to be merged. The simplify pass explicitly noted this and didn't collapse them; that was the right call.
- **Semantic HTML**: pill is a real `<button type="button">`, icons are correctly `aria-hidden`, the prompt `$` is decorative-hidden, the button's `aria-label` carries the full intent. Keyboard activation is free.
- **Article X.1 register compliance**: byline uses `·` (middle dot, U+00B7), no em dashes anywhere in user-facing copy. The CSS comments use em dashes — but CSS comments aren't user-facing and the existing site stylesheet uses them throughout. Consistent.
- **Code-comment hygiene**: after the inline simplify pass, comments lean WHY (breakpoint rationale, JS contract relationship). Most prior WHATs were trimmed.

## Recommended actions (priority order)

1. **[P1] `$impeccable adapt`** — add the missing `@media (max-width: 720px) { .brand .byline { display: none; } }` rule. 3 lines. Fixes header overflow on mobile.
2. **[P2] `$impeccable harden`** — add `aria-live` status announcement on the pill (and back-port to `.cli-strip` for consistency). Adds 1 line to the JS handler, 1 SVG-sibling span to both copy components, and a new `.visually-hidden` utility class. AA win for both copy affordances.
3. **[P2] `$impeccable adapt`** — bump pill vertical padding to ~10px inside the `< 640px` media query for a 40px touch target. Optional.
4. **[P3] `$impeccable polish`** — relocate the orphaned `.cli-strip` 480px media query next to its 720px sibling. Cosmetic.

After these, re-run `$impeccable audit` to confirm the score moves to 19–20/20.

---

You can ask me to run these one at a time, all at once, or in any order you prefer.

Re-run `$impeccable audit` after fixes to see your score improve.
