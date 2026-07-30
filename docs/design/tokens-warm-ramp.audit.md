# impeccable audit — tokens-warm-ramp

Surface: `site-src/assets/site.css` token layer + layout primitives
Reference: `docs/design/site-1b-proof-grid.html` (direction 1b, "Proof grid")
Register: inherit — DESIGN.md "quiet authority / editorial calm"

## Score

| Dimension | Score | Note |
|---|---:|---|
| Accessibility | 3/4 | One AA failure found and fixed; all 18 measured pairs now clear their floor |
| Theming | 4/4 | Every new token in `oklch()`, role-named, composes with the existing ramp |
| Reference fidelity | 4/4 | Max ΔE2000 0.16 after fix (criterion was ≤ 2.0) |
| Consistency | 3/4 | Two near-identical dark surfaces retained; see P2 |
| Responsive | 4/4 | `.canvas` constrains by `max-width` + `padding-inline`, no fixed widths |

**P0: 0 · P1: 2 (both fixed) · P2: 1 (accepted)**

## Criterion scoring

1. **Zero raw hex/rgb added outside `--mac-*`** — PASS. Enforced by AC-001, which also caught two hex literals in explanatory comments during implementation.
2. **Every new token in `oklch()`** — PASS. 13 new tokens, all `oklch()`.
3. **ΔE2000 ≤ 2.0 per token vs reference hex** — PASS *after fix*. Was VIOLATED at audit time.
4. **`--accent` byte-unchanged** — PASS. Asserted by AC-002 against `git show HEAD`.

Measured ΔE2000 (CIEDE2000, D65):

| Token | Reference | ΔE2000 |
|---|---|---:|
| `--band-warm` | `#f4ddcd` | 0.09 |
| `--band-cool` | `#f0ece4` | 0.16 |
| `--band-ink` | `#15130f` | 0.13 |
| `--band-footer` | `#0f0e0b` | 0.06 |
| `--on-dark-bright` | `#f4ede2` | 0.15 |
| `--on-dark-body` | `#c8c0b3` | 0.03 |
| `--on-dark-muted` | `#8b8377` | 0.07 |
| `--accent-deep` | `#a33a09` | 0.13 |
| `--accent-warm` | `#e0873f` | 0.06 |
| `--dc-refuse` | `#d1503f` | **5.51 → 0.00** |

## P1 findings (both fixed in this pass)

### P1-1 — `.eyebrow` used `--accent` as text on the warm band: 3.89:1, fails AA

`.eyebrow` is 12px display copy rendering inside `.hero.band.band--warm`, and its `color: var(--accent)` measured **3.89:1** against `--band-warm` — below the 4.5 AA floor for body text.

The project's own contrast test could not catch this. It scores token **pairs** drawn from a declared list; it does not resolve which token a given rendered element actually inherits. A pair-based test and a usage-based failure are different oracles.

Fixed by extending the warm-band accent re-lighting to every accent-coloured text role that can land there (`.eyebrow`, `.arr`, `.accent`, bare links), not just `.accent`. Now 5.09:1.

### P1-2 — `--dc-refuse` drifted 5.51 ΔE from the reference for no benefit

Set to `oklch(65% 0.167 30.2)` against the reference's `oklch(60% 0.167 30.2)`, lightened on the assumption that the reference value would not clear AA on the console surface. Measured: the **exact reference value scores 4.61:1**, above the 4.5 floor. The deviation bought nothing and broke criterion 3.

Fixed to the exact reference value. ΔE now 0.00, contrast still passes.

## P2 finding (accepted, not fixed)

### P2-1 — `--band-ink` and `--band-footer` are 1.04:1 apart

18.8% vs 16.4% lightness. Against each other they measure **1.04:1** — visually one surface, not two.

Accepted, because they never touch: the rendered band order is `warm hero → paper → cool §II → paper → ink org band → warm CTA → footer`. The warm CTA always separates them. The footer being fractionally deeper is the reference's own intent and reads as depth rather than as a distinct surface, which is correct here.

Worth revisiting if a future layout ever places the org band directly above the footer — at 1.04:1 the seam would vanish.

## Contrast sweep — pairs the test suite does not assert

All measured after the P1 fixes. Suite asserts 7 pairs; these 8 are additional real pairings.

| Pair | Ratio | Floor | |
|---|---:|---:|---|
| `--on-dark-muted` on `--band-footer` | 5.17 | 4.5 | PASS |
| `--on-dark-muted` on `--band-ink` | 4.96 | 4.5 | PASS |
| `--accent-warm` on `--band-ink` (`.tm-stage`, 11px) | 6.80 | 4.5 | PASS |
| `--accent-warm` on `--band-footer` (link hover) | 7.07 | 4.5 | PASS |
| `--on-dark-bright` on `--band-footer` | 16.61 | 4.5 | PASS |
| `--on-dark-body` on `--band-footer` | 10.71 | 4.5 | PASS |
| white on `--accent` (`.top-cta` label) | 5.08 | 4.5 | PASS |
| white on `--accent-deep` (`.top-cta` hover) | 6.65 | 4.5 | PASS |
| `--dc-refuse` on `--code-bg` | 4.61 | 4.5 | PASS |

`--on-dark-muted` at 4.96 and `--dc-refuse` at 4.61 are the two thinnest margins. Neither has headroom for a future darkening of its band.

## Ramp coherence

New neutrals run hue **78.2–91.7**, inside the intended warm band; no outlier. The lightness ladder is 16.4 / 18.8 / 61.4 / 81.1 / 91.2 / 94.4 / 94.9 — well spaced apart from the `--band-ink`/`--band-footer` pair in P2-1 and the `--on-dark-bright`/`--band-cool` pair (94.9 vs 94.4), which likewise never meet (one is foreground on dark, the other a light surface).

The new ramp **extends** rather than shadows the existing system: `--ink`/`--text`/`--muted`/`--rule` keep their roles on light surfaces, and the `--on-dark-*` tokens are named for the surface they sit on rather than for how they look.

## Reserved-accent contract

The `--accent-deep` / `--accent-warm` split does **not** violate DESIGN.md's reserved-accent contract. The contract governs *which surfaces* may carry accent (brand dot, H1 terminal accent, section number, state, small typographic moments); these two tokens change *which value of accent* is correct on a given background, leaving the permitted-surface list untouched. Accent gained no new decorative surface.

One thing the contract should eventually record: it currently names `--accent` and `--accent-light` by token name. With three accent values in play, the contract would read more precisely as "the accent role, re-lit per surface". Not actioned here — DESIGN.md is outside this row's write set and belongs to `impeccable document`.
