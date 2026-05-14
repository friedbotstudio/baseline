# readme-rewrite — archive bundle

**Date:** 2026-05-14
**Track:** chore (no failing-test-driven code change; documentation rewrite + asset add + typo fix)
**Companion bundles (same day):** [`release-workflow-spec-correction`](../release-workflow-spec-correction/), [`site-relative-urls`](../site-relative-urls/)

## What was rewritten

The repository `README.md` was replaced with a product-shaped entry page: centered logo block, factual-only badge row, inline section nav, twelve body sections, collapsed update history. The previous README was 386 lines of internal-manifesto prose (organised by what-you-get inventories first, install instructions sprinkled mid-file); the new one is ~250 lines organised as a reader journey (identify → install → use → docs → contribute → report → metadata).

Companion banner additions (added during the chore phase, before commit):

- `README.md` — `> [!WARNING]` callout above the existing `> [!IMPORTANT]` install note. Surfaces the public-alpha state in the README header. GitHub renders this with a yellow triangle icon.
- `site-src/_layouts/base.njk` — `<aside class="alpha-banner" role="status">` rendered on every page above the topnav. Subtle accent-tinted strip; mono font; uses existing DESIGN.md tokens (`--accent`, `--accent-soft`, `--mono`).
- `site-src/assets/site.css` — new `.alpha-banner` block with no new CSS variables introduced; sits next to the skip-link rules per CSS file convention.

Companion files committed alongside:

- `.github/assets/logo-baseline.svg` — new. Brand mark at 256×256, rounded near-black square + orange center dot. Derived from the existing favicon SVG at `site-src/_layouts/base.njk:11`. Referenced by the README header via a `<picture>` block (same source for both colour schemes since `DESIGN.md` is single-theme light).
- `SECURITY.md` — was already in the working tree as a stray Auth0-template paste with the wrong project name ("Keploy"). Fixed to "Baseline" plus a punctuation tidy.
- `CODE-OF-CONDUCT.md` — was already in the working tree, standard Contributor Covenant prose. Left untouched; linked from the README's Contributing section.
- `LICENSE` — Apache 2.0, Friedbot Studio 2026. Already in the working tree; linked from the README's License section.

## Why now

Three trigger events from the same week informed this rewrite:

1. **First production Pages deploy exposed the asset-404 failure** (see [`site-relative-urls`](../site-relative-urls/) ARCHIVE.md). The deploy made the repo's public face visible to users for the first time. The existing README, written for engineers already inside the codebase, was the wrong shape for that public face.
2. **The Auth0 open-source-template README sample** ([URL](https://raw.githubusercontent.com/auth0/open-source-template/refs/heads/master/README-sample.md)) was nominated as a structural skeleton. Auth0's outline is light scaffolding designed for a library/SDK; adapted, it fits a discipline-overlay product distributed via `npx`.
3. **The Personal-AI-Infrastructure (PAI) README** was nominated as a visual reference for header chrome (centered logo, badge rows, inline nav, collapsed update history). Partial adoption — the structural and navigational patterns transplant; the vanity badges, animated typing SVG, social-proof metrics, sponsor block, and emoji-heavy headers do NOT (would break `DESIGN.md`'s anti-references).

## Sources synthesised

| Source | What it contributed |
|---|---|
| `https://raw.githubusercontent.com/auth0/open-source-template/refs/heads/master/README-sample.md` | Outline: Project / TOC / Documentation / Installation / Getting Started / Contributing / Support / Vulnerability Reporting / About-org / License. Adapted to drop the "Thank You" section (auth0-specific) and to surface the structural-counts strip in "What this is" rather than at the bottom. |
| `PRODUCT.md` | Voice: constitutional, structural, uncompromising. Audience: senior/staff engineers tool-chain literate. "Make it structurally impossible for an AI agent to violate a rule the team has already decided on." Anti-references: no AI slop, no hyperbole, no hero-metric vanity. |
| `DESIGN.md` | Visual register: quiet authority, editorial calm, single-theme light, reserved orange accent. Structural-counts naming load-bearing components is permitted and encouraged when each cell is verifiable. |
| Previous `README.md` (386 lines) | Mined for accurate technical content — CLI flag list, requirements, first-run quickstart, MCP-server names. Tightened and reorganised. |
| Personal-AI-Infrastructure README | Visual chrome patterns only (centered logo block, badge row composition, inline nav, `<picture>` source-set, `<details>` update history). Structure ideas: callout-banner for current version, inventory-as-table. |

## Conditional-trigger decisions

| Phase | Decision | Rationale |
|---|---|---|
| `simplify` | RAN | Diff exceeded ~30 lines and touched > 3 files (README rewrite + SECURITY + LICENSE + CODE-OF-CONDUCT + logo + archive bundle). Cleanup pass found no mechanical issues to fix — prose audit was clean of AI-writing tells beyond one acceptable rule-of-three anaphora (the structural-impossibility "cannot…" trio). |
| `security` | SKIPPED | Pure prose + a static SVG. No attack surface added. |
| `integrate` | RAN | Re-stamped the `audit-baseline` verdict post-edit. PASS. |
| `document` | SKIPPED | The work IS the documentation. No derivative doc to update. |
| `archive` | RAN | Mandatory. This bundle. |

## What's NOT included (operator actions, post-merge)

- DNS configuration for `baseline.friedbotstudio.com` (companion to [`site-relative-urls`](../site-relative-urls/); the README header badges link to that domain)
- Publishing `create-baseline` to npm so the `release` and `last-commit` shields-io badges have data to render against
- Triggering the Release workflow to populate the docs site at `https://baseline.friedbotstudio.com/`

Until those land, the badges may show "no data" / "404" placeholders rather than real values. That's expected and self-resolves on the first release.

## Companion to pending-questions

This work doesn't open a new pending question. It's tangentially relevant to **Q-002** (silent-failure prerequisites need enforcement ACs) only insofar as a polished README is part of the public face that exposes those silent failures more quickly — a passable README is itself a kind of "first preflight" for casual visitors.

See `harness.log` (this directory) for per-phase timestamps.

## Companion artifacts (live, not archived)

- The full diff is committed in the same commit as this archive bundle:
  - `README.md` (rewritten)
  - `SECURITY.md` (Keploy → Baseline typo fix)
  - `.github/assets/logo-baseline.svg` (new)
  - `CODE-OF-CONDUCT.md` (new — committed alongside; standard Contributor Covenant)
  - `LICENSE` (new — committed alongside; Apache 2.0)
