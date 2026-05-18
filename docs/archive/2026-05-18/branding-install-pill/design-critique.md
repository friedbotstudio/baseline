# Design critique — `branding-install-pill`

`$impeccable critique` run against the header byline + install-pill component. UX heuristics, not technical. Read-only; findings only, no fixes applied.

## Design Health Score

Nielsen's 10 heuristics, scored 0–4:

| # | Heuristic | Score | Key issue |
|---|---|---|---|
| 1 | Visibility of System Status | 3 | Silent failure path: if both `clipboard.writeText` AND `execCommand` throw, the UI still flips to `.is-copied` and announces success — false-positive feedback |
| 2 | Match System / Real World | 4 | Byline phrasing + pill anatomy match engineer conventions everywhere |
| 3 | User Control and Freedom | 3 | No undo for copy (intrinsic; not a real flaw); clipboard write overwrites user's existing clipboard without warning |
| 4 | Consistency and Standards | 3 | Pill focus-offset is 2px vs. cli-strip's 3px; pill radius 10px vs. cli-strip's 12px — sub-pixel cousin-drift |
| 5 | Error Prevention | 3 | Two copy affordances reduce missed-copy risk; same silent-failure issue from heuristic 1 lurks here |
| 6 | Recognition Rather Than Recall | 4 | `$` + mono command + copy icon = universal "shell command, click to copy" |
| 7 | Flexibility and Efficiency | 3 | Pill is the efficient path; primary CTA "Get the baseline →" is the exploratory path. No keyboard chord shortcut (acceptable) |
| 8 | Aesthetic and Minimalist Design | 4 | Three elements per surface, nothing decorative; byline same scale as brand by design |
| 9 | Error Recovery | 2 | When the write actually fails (insecure context, perm denied), the UI lies — no recovery affordance, user only discovers via empty paste |
| 10 | Help and Documentation | 3 | `aria-label` + icon affordance; no tooltip; sparse but defensible for the audience |
| **Total** | | **32/40** | **Good–Excellent** (one P1, two P2s, rest is polish) |

## Anti-patterns verdict

**Pass.** Byline and pill carry no AI tells. Specifically:

- No category-reflex on a developer-docs site (no "neon on black", no SaaS-gradient hero treatment).
- No glassmorphism, no gradient text, no side-stripe accents, no hero-metric template, no identical card grids.
- Em-dash hygiene: byline uses `·`; pill copy is the literal command. Article X.1 compliant.
- Pill mirrors npm / Vercel / GitHub install-snippet patterns without copying any one of them verbatim.
- The byline reads as a deliberate attribution, not as filler — distinct from "Made with ❤️ by …" SaaS reflex.

## Overall impression

The two surfaces do their jobs without theatre. The byline establishes brand authorship without competing with the wordmark. The pill makes "here's the one command, just paste it" the lowest-friction action on the page, AND coexists with the existing loud cli-strip (which earns its loudness above the footer as the final CTA).

The single biggest issue is **silent clipboard-failure**: when the browser refuses both copy paths (rare but real on iOS Safari without HTTPS, on Firefox without explicit permission, on legacy embedded browsers), the user sees a check icon AND hears "Copied install command" — but their clipboard is unchanged. They paste, get nothing, blame the docs site, churn.

## What's working

- **Scale-as-restraint.** The pill is "low-noise via small dimensions and contained context", not "low-noise via desaturation". The fully-saturated dark surface against the light page is confident — the SIZE keeps it from competing. This is the right register for a tools brand: design as quiet authority, not design as apology.
- **Two-action-two-mental-model split on the homepage.** "Get the baseline →" (orange primary CTA, navigates to install page with requirements + recovery instructions) and the pill (one-click copy for engineers who already know what they want) serve genuinely different decision states. Many docs sites flatten this into a single CTA and frustrate one of the two audiences.
- **System kinship without duplication.** Pill and cli-strip share aesthetic DNA (dark, mono, dollar prompt, check on copy) but have different anatomy (icon swap vs. caret+check) and different scale (compact vs. full-width). They read as siblings, not as inconsistent variants. The `/simplify` pass correctly resisted the urge to collapse them.

## Priority issues

### [P1] Silent clipboard-failure surfaces as false success

- **What**: `site-src/assets/site.js:244-275` — both copy paths (`navigator.clipboard.writeText` and the textarea + `execCommand("copy")` fallback) sit inside `try/catch` blocks that swallow errors. The handler then **unconditionally** adds `.is-copied`, swaps the icon, and writes "Copied install command" to the live region. If both writes failed (no clipboard API + secure-context refusal + `execCommand` deprecation), the user sees confident success while their clipboard is empty.
- **Why it matters**: The user's only signal that copy failed is pasting and getting nothing. They blame the docs site, not the browser. For an evaluation-mode visitor who came to assess our quality, this is the worst possible first impression. The aria-live announcement amplifies the lie — a screen-reader user hears "Copied install command" with zero corroboration.
- **Fix**: Track each write attempt's actual return value (or success of `document.execCommand`). Apply `.is-copied` only when at least one succeeded. On both-fail: don't toggle the icon, set the live region to "Could not copy — select the command and press Ctrl+C", and select the command text inside the button so manual copy is trivial. The button can also display its `data-copy` value via `title` so the user can read-and-retype.
- **Suggested command**: `$impeccable harden` (production-ready error states).

### [P2] Cousin-drift between pill and cli-strip (focus-offset, radius)

- **What**: `site-src/assets/site.css` — `.install-pill:focus-visible` uses `outline-offset: 2px` while `.cli-strip:focus-visible` uses `outline-offset: 3px`. Border radius is `10px` on the pill and `12px` on the strip. These are siblings with sub-pixel inconsistency.
- **Why it matters**: A keyboard user tabbing through the homepage hits the pill in the hero (offset 2) and then later the strip above the footer (offset 3). The shift is noticeable in side-by-side comparison; for screen-reader-and-keyboard users who rely on the focus ring as anchor, drift increases cognitive load by a tiny constant.
- **Fix**: Pick one. The pill's 2px feels right for compact scale; the strip's 3px feels right for the larger element. Or harmonize both to 2px (which matches the rest of the site at `site.css:110`). Same for radius — either both 10 or both 12.
- **Suggested command**: `$impeccable polish` (final consistency pass).

### [P2] Homepage hero — two simultaneous "install" actions in close proximity

- **What**: `site-src/index.njk` lines 15–20 — the `.lead` paragraph ends, then the install-pill appears, then the `.ctas` block presents "Get the baseline →" and "Read the docs". For a visitor in active evaluation mode, three calls-to-action stack within ~150px of vertical space, two of which lead to the same install workflow via different paths.
- **Why it matters**: The "Get the baseline →" CTA navigates to `/install/`, which presents the same pill at the top. For a low-decision-tolerance reader the redundancy reads as "do I click here or there?" Senior engineers will resolve this in 1 second; less-confident first-timers may pause. Both options work, but the choice doesn't earn its weight.
- **Fix**: Three options, in order of how much you want to rework:
  - (a) Relabel "Get the baseline →" to "See install requirements →" so the two paths are visibly different intents (copy-and-go vs. read-then-install).
  - (b) Remove "Get the baseline →" — let the pill be the install action, demote secondary navigation to "Read the docs" only.
  - (c) Move the pill below the meta-strip (after the counts) so the hero retains its current dual-CTA flow with the pill as a quieter "or just install now" follow-on.
- **Suggested command**: `$impeccable clarify` (UX copy refinement, option a) or `$impeccable layout` (re-rhythm option c).

## Persona red flags

Two personas auto-selected from PRODUCT.md's "Users" section:

**Sam (Senior Engineer, 30-second Evaluator).** Lands on homepage, has 30 seconds to decide whether to install. **Works**: sees the pill in the hero, copies, pastes, baseline lands. Zero friction. **Red flag**: hits the P2 redundancy — "Get the baseline →" or the pill? Resolves in 1 second; not a blocker. **Red flag**: silent-failure on iOS Safari without HTTPS = blanket "this site doesn't even work, what's the point" response. P1 covers it.

**Devi (Tool-Chain-Literate Reference Reader).** Already installed; landing on `/install/` to look up a recovery flag. **Works**: pill at the top is a friction-free re-copy of the canonical command. The page's deeper sections (`/install/#recover`) give what she needs. **Red flag**: the pill on install.njk:23 plus the `<pre>` block with the same command at install.njk:54–62 is a third copy of the same string in close proximity. Not broken, but worth noting — that block could itself become a click-to-copy variant in a future workflow.

## Minor observations

- **Byline phrase choice**: "by friedbotstudio" is conventional + brand-correct. A more confident alternative might be "from Friedbot Studio" or just "Friedbot Studio" alone — but "by" is the most engineer-recognized attribution pattern. The current choice is defensible; don't change it unless the brand voice itself wants more weight.
- **Tab order**: pill in homepage hero now sits between `.lead` and `.ctas`. Tab order: nav → pill → primary CTA → secondary CTA → meta-strip → … This is correct — the pill is the most efficient action, so it earns the tab-priority position.
- **Mobile gut-check**: at < 720px the byline hides (P1 fix from the audit). The pill becomes full-width with ellipsis truncation. Both behaviors verified in CSS. Worth eyeballing in a real mobile viewport before commit, but no code-level red flag.
- **GA4 instrumentation**: the pill is instrumented (`gtag('event', 'copy_install_command', ...)` at site.js:262); the cli-strip is too. Both fire — analytics will be able to tell which surface visitors prefer over time. Useful for the next iteration.
- **DESIGN.md alignment**: the new component doesn't appear in DESIGN.md. After commit, DESIGN.md should pick up `.install-pill` as a documented component, especially since it's a reusable partial. Out of scope for this critique; flag for a `/document` follow-up.

## Questions to consider

1. **Does the byline want to grow?** Right now it's a quiet attribution. If Friedbot Studio's brand wants higher visibility (other products, portfolio), the byline could become a tiny link to friedbotstudio.com instead of plain text. Future-only — not for this workflow.
2. **Should the install command be a single component?** Today: `.cli-strip` (loud, final CTA) + `.install-pill` (quiet, near-content) + `<pre>` blocks on `/install/` showing the command in syntax-highlighted context. Three near-identical surfaces. A unified "install-command" component with size variants (`sm` / `md` / `lg`) would consolidate. But that's a bigger refactor than this workflow's scope.
3. **What's the right success state for copy?** Today: icon swap + aria-live "Copied install command". For 1.8 seconds. Then resets. Is 1.8s the right window? Too short for a user mid-paste-paste-paste session; too long for repeated clicks (the second click sees the check still up from the first). Worth measuring in production.

## Ask the user

The critique is short — three issues stand out. Rather than ask which category to prioritize (the answers are obvious from the report), I'll surface the top-line decisions inline:

- **P1 silent clipboard failure** is a correctness bug masquerading as a UX issue; ship a fix.
- **P2 cousin-drift** is a 5-minute polish item; ship the fix.
- **P2 dual install CTAs in hero** is a copy/IA decision the user owns — three options (a/b/c) laid out above.

## Recommended actions

Priority order:

1. **[P1] `$impeccable harden`** — fix the silent clipboard-failure path in `site.js`. Surface failures via the live region; offer manual-copy fallback (select the command, show `title`).
2. **[P2] `$impeccable polish`** — harmonize `:focus-visible` outline-offset and border-radius across `.install-pill` and `.cli-strip`. Pick one set of values, apply to both.
3. **[P2] User decides** — between options (a / b / c) for the homepage hero CTAs. Once chosen, `$impeccable clarify` (copy) or `$impeccable layout` (re-rhythm) executes it.

If we ship only #1 the score moves to 35/40. If we ship #1 + #2 → 36/40. If all three → 38/40.

---

You can ask me to run these one at a time, all at once, or in any order you prefer.

Re-run `$impeccable critique` after fixes to see your score improve.
