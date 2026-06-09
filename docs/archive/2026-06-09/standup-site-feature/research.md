# Pattern Research — feature the standup skill on the marketing site

No new third-party library is introduced. The work uses the existing eleventy + nunjucks site toolchain and reuses on-disk CSS components. **context7 is not applicable** (no external API to verify). The forks below are IA/reuse decisions; the actual visual execution runs through `design-ui`→`impeccable` at `/tdd`, so this memo is about approach and tradeoffs, not pixel choices.

Stack confirmed: `eleventy.config.cjs` (input `site-src/`, output `obj/site/`), build `npm run build:site`, dev `npm run dev:site` (port 4321). No `package.json` dependency changes required.

---

## Fork A — terminal-block rendering

### Candidate A1: reuse `.dc-*` as a STATIC dev-console block
- **Summary**: render the readout inside the existing dev-console markup (`.dc-frame`/`.dc-bar`/`.dc-dots`/`.dc-file`/`.dc-body` `<pre><code>`, `index.njk:33-39`), as static text, wrapped in `<figure aria-labelledby>` + `<figcaption>`.
- **Fits**: Yes — directly reuses the component the scout found, with its existing tokens (`--code-bar-bg`, `--dc-*`, `--mac-red`). Zero new CSS for the frame; satisfies AC-4 (text not image) and AC-9 (real readout) with the established look.
- **Tests it enables**: build-output assertion that the readout text is present and is not inside an `<img>`.
- **Tradeoffs**: a long readout needs vertical room and horizontal scroll on mobile (AC: figure scrolls internally). Minimal: a small amount of token-class markup for the recap lines.

### Candidate A2: the animated/streamed hero variant
- **Summary**: reuse the hero's streamed console (`id="dc-stream"`, driven by `site-src/assets/site.js`) to type the readout in.
- **Fits**: Weaker — adds JS coupling and a motion surface that must be `prefers-reduced-motion`-gated (AC-8), and a streamed block is harder to make AT-readable as static selectable text (AC-4). The hero already owns the "animated console" moment; repeating it dilutes it.
- **Tradeoffs**: more moving parts, more a11y burden, no real gain over a static block for a proof artifact the reader wants to scan.

### Candidate A3: new bespoke figure component
- **Summary**: author a fresh terminal component in `site.css`.
- **Tradeoffs**: Rejected — violates reuse-before-create with an established `.dc-*` component on disk; more CSS to maintain, more drift surface.

### Recommendation (Fork A): **A1 — static `.dc-*`.** Least new code, on-brand, AT-friendly, satisfies AC-4/AC-9 directly. **What would flip it**: if the readout proves too tall to scan comfortably, a collapse/expand affordance (still static text) is a smaller change than going animated.

---

## Fork B — homepage teaser content

### Candidate B1: headline + subhead + a trimmed 3-4 line `.dc-*` snippet + link
- **Summary**: the teaser shows a *short* dev-console snippet (last release + N unreleased + next bump + a "recommended next" line) and a `data-cta` link to `/standup/`.
- **Fits**: Yes — demonstration-on-home is the persuasion strategy's core move; a trimmed snippet previews the proof without reproducing the full page.
- **Tradeoffs**: two readout renderings to keep plausibly consistent (the snippet and the full page block). Mitigated by keeping the snippet a deliberate excerpt, not a second source of truth.

### Candidate B2: headline + subhead + link only (no readout on home)
- **Summary**: tease in words; the full readout lives only on `/standup/`.
- **Tradeoffs**: lower maintenance, but the homepage loses the demonstration hook exactly where attention is highest. Weaker against the strategy.

### Recommendation (Fork B): **B1 — trimmed snippet.** The demo is the whole point of featuring standup; a 3-4 line excerpt is cheap and lands the proof on the homepage. **What would flip it**: if the homepage is judged too long already, B2 keeps it lean and defers the demo one click.

---

## Fork C — two surfacing modes (on-demand vs session-start)

### Candidate C1: a small caption under the block (page only)
- **Summary**: one line beneath the readout: "runs on demand via `/standup`; a compact version also appears at session start." No interactive widget.
- **Fits**: Yes — lowest clutter; states the fact without a control to build/test/a11y.
- **Tradeoffs**: no live toggle, but there is nothing to toggle on a static marketing page.

### Candidate C2: a 2-item toggle (on-demand / session-start)
- **Tradeoffs**: Rejected for now — a JS toggle adds interaction, state, and a11y/`prefers-reduced-motion` surface for a distinction a caption conveys in one sentence. YAGNI.

### Recommendation (Fork C): **C1 — caption on the page; omit modes from the teaser.** Keep the teaser to one idea (the recap exists, here's a peek). **What would flip it**: if user testing shows people miss the session-start behavior, promote it to its own short sub-point on the page (still no toggle).

---

## Fork D — sourcing the real readout (AC-9: real, not fabricated)

### Candidate D1: capture from the live repo at a representative moment
- **Summary**: at build/authoring time run `node .claude/skills/standup/gather.mjs` against the repo when its state is representative (this branch carries an unpushed commit `3fffd06` plus the live 8-entry backlog and 3 pending questions, so the readout already shows commits-since-tag, a bump, buckets, and open questions). Transcribe that real output into the `.dc-*` block.
- **Fits**: Yes — honest (it is the tool's actual output), and richer than a bare "0 unreleased" snapshot.
- **Tradeoffs**: it is a point-in-time snapshot embedded as static text; it will not auto-update. That is acceptable for a marketing demo (clearly an example), and the `<figcaption>` can note it is an example readout.

### Candidate D2: build a fixture repo to generate a fuller readout
- **Summary**: construct a throwaway repo with synthetic commits/backlog to produce a denser readout.
- **Tradeoffs**: Rejected — synthetic state is fabrication-adjacent (against AC-9's spirit) and more work than capturing the genuine article.

### Recommendation (Fork D): **D1 — capture the genuine readout** during `/tdd`, label it as an example in the figcaption. **What would flip it**: nothing within scope; D2 trades honesty for density and is not worth it.

---

## Fork E — verifying the page-reachable AC

### Candidate E1: lightweight build-output assertion test
- **Summary**: a test that runs `npm run build:site` (or `eleventy`) and asserts `obj/site/standup/index.html` exists, contains the readout text, contains no `<img>` for the readout, and contains no em dash in the standup-section markup.
- **Fits**: Yes — directly checks AC-1/AC-4/AC-7 deterministically; runs in the `/integrate` suite. `obj/` is gitignored, so the test builds into it transiently and reads the output (consistent with how other build tests operate).
- **Tradeoffs**: a full eleventy build per test run is a few seconds; gate behind the existing publish/build test conventions so it does not slow the default unit suite unduly.

### Candidate E2: rely on the eleventy build + integrate-phase playwright smoke
- **Summary**: no dedicated test; the build failing on a bad include and the cross-engine smoke navigating to `/standup/` are the safety net.
- **Tradeoffs**: catches "page renders" but not the content assertions (text-not-image, no em dash); those would regress silently.

### Recommendation (Fork E): **E1 for the content assertions, plus E2's playwright smoke for cross-engine render.** The build-output test pins AC-1/4/7; the integrate smoke confirms it renders in chromium/webkit/firefox. **What would flip it**: if a build-in-test proves too slow for CI, move the content assertions to a post-build grep step in the build script and keep only the smoke.

---

## Recommendation (overall)
- **A1** static `.dc-*` block; **B1** trimmed snippet on the homepage teaser; **C1** caption (page only); **D1** capture the genuine readout, labeled as an example; **E1+smoke** build-output assertion plus the integrate playwright pass.

This keeps the change to: 2 new files (`site-src/standup.njk`, `hero-symbols/standup.njk`), edits to `index.njk` + `nav.json` + `footer.njk` + `skills/core.njk`, possibly a small `site.css` addition (reveal-motion block, gated), and one build-output test. No new dependencies, no skill-count change.

## Open questions (for the human at /spec)
1. Teaser slot precision — confirm the new `<section>` lands immediately before "Adoption" (`index.njk:519`) vs right after "How it flows" (`:184`). (Design call in the spec's Design calls section.)
2. Whether the trimmed homepage snippet (B1) is acceptable given homepage length, or B2 (words-only teaser) is preferred to keep it lean.
3. Whether to add the build-output test to the default `npm test` glob or gate it behind a build-tests flag (per the existing publish-check convention) to control suite time.
