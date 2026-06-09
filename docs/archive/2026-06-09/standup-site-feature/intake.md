# Feature the `standup` skill on the marketing site: a /standup page + homepage teaser

<!--
Intake document. Produced by the `intake` skill.
Primary input: docs/brief/standup-site-feature.md (brainstorm brief).
Required sections (enforced by artifact_template_guard): Problem, Goal, Acceptance criteria.
-->

## Problem

The `standup` skill shipped in commit `3fffd06` but has zero presence on the marketing site. The homepage sells hooks, skills, and the workflow, yet a new capability that removes a real daily-ritual pain (reading `CHANGELOG` + `git log` + backlog by hand at the start of every planning session) is invisible to a visitor deciding whether to install the baseline. Standup is unusually demo-able: its output is a concrete, structured artifact, which is exactly the kind of proof a skeptical developer audience responds to. Today that proof is nowhere on the site.

## Goal

A developer evaluating the baseline can discover what `/standup` does, see the real recap it produces, and copy the command to try it, reached from the homepage and from site navigation.

## Non-goals

- Not a generic features-page rewrite, and not a redesign of the existing homepage sections.
- Does not change `standup` skill behavior (already shipped in `3fffd06`).
- No email capture, signup, or lead-gen.
- No scarcity, fake-urgency, or FOMO widgets (they read as manipulation to a developer audience and would corrode the disciplined brand voice).

## Success metrics

- `/standup/` page exists and is reachable after the eleventy build.
- Standup is linked from at least three discovery surfaces: topnav, footer, and the skills catalog page.
- The homepage teaser carries a `data-cta` attribute (matching the existing `data-cta="read-the-docs"` pattern) so click-through to `/standup/` is measurable in GA4 later. Baseline: 0 (no presence today). Target: presence + measurable CTA. Measured via: the rendered site + GA4 events.

## Stakeholders

- **Requester**: Tushar Srivastava (baseline maintainer, razieldecarte@gmail.com)
- **Reviewer**: Tushar Srivastava
- **Operator** (who runs it in prod): the eleventy site build → GitHub Pages deploy.

## Constraints

- **Article X.2** — the UI surfaces (`site-src/**`) are `tdd.ui_globs`, so the spec SHALL carry a populated `## Design calls` section and `/tdd` Step 6 routes design work through `design-ui`→`impeccable`.
- **Article X.1** — rendered marketing copy on `site-src/**` is bound by impeccable's shared-design-law bans: no em dashes, no gradient text, no glassmorphism-as-default, no side-stripe borders > 1px, no hero-metric template, no fluff words (seamless / powerful / revolutionary / effortless). Lowercase, plain, confident.
- **Eleventy conventions** — feature pages use `layout: docs.njk` with frontmatter (permalink, pageTitle, title, titleAccent, eyebrow, lead, active, sidebarActive, heroSymbol, toc); nav lives in `site-src/_data/nav.json`; footer in `site-src/_includes/footer.njk`; each page has a `heroSymbol` SVG under `site-src/_includes/hero-symbols/`.
- **No new dependencies.** Reuse the existing design tokens in `site-src/assets/site.css` and the `.cli-strip`/`data-copy` click-to-copy pattern.
- **Accessibility floor** — the terminal readout is informative text, not an image: it must be AT-readable, selectable, and carry a summarizing `<figcaption>`.
- **Audit neutrality** — adding a site page does not change the skill count; the `audit-baseline` count reconciliation must stay green.

## Acceptance criteria

1. Given the eleventy build runs, when it completes, then a `/standup/` page is emitted (`standup/index.html`) and reachable.
2. Given the `/standup` page, when rendered, then it uses `layout: docs.njk` with a TOC, eyebrow, lead, and a `heroSymbol`, structurally consistent with `memory.njk` / `swarm.njk`.
3. Given the page, when rendered, then a new hero-symbol partial at `site-src/_includes/hero-symbols/standup.njk` exists and renders (no missing-include error).
4. Given the page's centerpiece, when rendered, then the standup readout is semantic HTML text inside a `<figure>` (monospace `<pre>`/list + `<figcaption>`), and is NOT an `<img>`; the text is selectable.
5. Given the homepage, when rendered, then a compact teaser section appears between the "How it flows" and "Adoption" sections and links to `/standup/`.
6. Given site navigation, when rendered, then `site-src/_data/nav.json` (topnav + sidebar) and `site-src/_includes/footer.njk` both contain a link to `/standup/`, and `site-src/skills/core.njk` names `standup` in the catalog.
7. Given the rendered `/standup` page and homepage teaser copy, when scanned, then it contains no em dash (`—`) and none of the Article X.1 banned fluff words.
8. Given a user with `prefers-reduced-motion: reduce`, when the page loads, then any reveal-on-scroll animation is disabled (gated in CSS).
9. Given the build, when the terminal block is populated, then its content is a representative REAL `/standup` readout captured from an actual repo state (with unreleased commits and a populated backlog), not a fabricated mock.
10. Given the page and teaser, when rendered, then the primary CTA is a click-to-copy `/standup` pill reusing the existing `.cli-strip` / `data-copy` mechanism (no signup, no email gate).
11. Given the full change, when `/integrate` runs, then the test suite and `audit-baseline` stay green.

## Open questions

- Final section/page headline: candidates are "where are we, what's next" (recommended), "start every session knowing where you left off", "the planning recap, minus the ritual". `copywriting` picks at build.
- Whether the homepage teaser shows a trimmed (3-4 line) readout snippet or only headline + link. (design call — to resolve in the spec's Design calls section.)
- Whether the two surfacing modes (on-demand vs session-start) appear on both the page and the teaser, or only on the page. (design call.)
