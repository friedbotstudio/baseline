# Pattern Research — changelog-skill-and-responsive-svgs

The intake raises 8 OQs + 2 secondary technical questions. This memo gives candidate-approach treatment to the three highest-stakes decisions and resolves the remaining six in a compact matrix. Library APIs cited below come from context7-verified docs or the keepachangelog spec — no training-data recall.

---

## Candidate set A: Where the keepachangelog fragment lives (OQ1)

### A1: Inline in the commit message body

- **Summary**: The changelog skill drafts a keepachangelog-shaped block (`### Added`/`### Fixed`/…) and inserts it into the commit message body before humanizer. `@semantic-release/changelog` and `release-notes-generator` parse the body at release time and concatenate.
- **API references (current)**:
  - `semantic-release@latest` — `analyzeCommits` step "determines the type of the next release; if multiple plugins implement it, the highest output wins" — context7 `/semantic-release/semantic-release` (FAQ, plugins.md).
  - `@semantic-release/release-notes-generator` runs in `generateNotes`; its output is what `@semantic-release/changelog`'s `prepare` consumes. Body-level keepachangelog headings would land inside the release notes verbatim.
- **Fits**: **Partial.** The current `/commit` skill body already passes through `humanizer` (`commit/SKILL.md:18`), and the new content would be a natural addition. **Conflict**: humanizer bans em-dashes and rule-of-three in user-facing copy; the keepachangelog headings (`### Added` etc.) are technical labels, not prose, so they survive — but the bullet bodies must respect the same rules.
- **Tests it enables**: AC1/AC2/AC8 — `git log -1 --format=%B HEAD | grep -E '^### (Added|Changed|...)'` confirms the block landed.
- **Tradeoffs**: Coupled to commit-message draft loop (one more thing humanizer must not strip). Loses if a future user wants the changelog without the commit-message paragraph noise. Multi-category entries become awkward (the message body becomes a small document).

### A2: Side file at `.changelog/<short-sha>.md`

- **Summary**: The skill writes a keepachangelog-shaped fragment to a per-commit side file under `.changelog/`. `@semantic-release/changelog`'s standard config doesn't read these (it builds from commit history) — so this requires a custom assembler at release time.
- **API references (current)**:
  - `@semantic-release/changelog@6.0.3` config: `{ changelogFile: "CHANGELOG.md" }` — context7 `/semantic-release/semantic-release` example. **No documented `inputDir` or per-commit-fragment input** in the umbrella docs.
  - `@semantic-release/git@latest` accepts an `assets` array (`["CHANGELOG.md", "package.json", ...]`) — context7. We could add `.changelog/*` so the side files get pushed but not auto-cleaned.
- **Fits**: **Poor.** Requires either a custom release-time assembler OR replacing `@semantic-release/changelog` with `release-please` (`/googleapis/release-please`, benchmark 78.34) which uses a different model. Both pull the workflow away from the current `.releaserc.json` baseline.
- **Tests it enables**: Same ACs as A1; plus a side-file presence check (`test -f .changelog/$(git rev-parse --short HEAD).md`).
- **Tradeoffs**: Worst of both worlds for this baseline — needs new release-time tooling AND doesn't gain anything the other two options don't give. Only attractive if we were planning a release-tooling rewrite anyway, which we are not (intake non-goal: "NOT modifying the npm release pipeline").

### A3: Append directly to `CHANGELOG.md` Unreleased section ✅ RECOMMENDED

- **Summary**: The skill maintains a `## [Unreleased]` block at the top of `CHANGELOG.md`, adds the new commit's entries under the appropriate keepachangelog sub-section, and commits the file alongside the diff. `@semantic-release/changelog`'s prepare step at release time prepends a versioned block ABOVE the Unreleased section.
- **API references (current)**:
  - `@semantic-release/changelog@6.0.3` — context7-confirmed: the plugin runs in the `prepare` step and updates `CHANGELOG.md`. **What is NOT documented in the umbrella docs**: whether it preserves an existing `## [Unreleased]` block when it inserts the new release block. ⚠ **Unable to verify from context7 alone.** The plugin's actual behavior at this seam needs an integration-test confirmation in the spec (could be a 5-line dry-run on a tempdir CHANGELOG.md fixture).
  - `@semantic-release/git@latest` already lists `CHANGELOG.md` as an asset (per `.releaserc.json` plugin chain), so subsequent release commits include both the skill's per-commit Unreleased edits AND the plugin's release-time version block in one push.
  - keepachangelog 1.0.0 spec — explicit: `## [Unreleased]` heading sits at the top; version blocks below it head with `## [1.1.1] - 2023-03-05` and ISO 8601 dates; compare links go at the file foot.
- **Fits**: **Strong.** The existing `CHANGELOG.md` already uses `# [version]` headings (close to keepachangelog with one `#` instead of two — a register fix the migration commit can carry), so the file shape is already 80% there. The skill becomes a curator of the Unreleased section; semantic-release stays in its lane.
- **Tests it enables**: AC1/AC2 — `head -3 CHANGELOG.md | grep '## \[Unreleased\]'`. AC8 — after a workflow ends, the committed CHANGELOG.md diff shows new lines under Unreleased.
- **Tradeoffs**: Needs the `@semantic-release/changelog`-preserve-Unreleased verification (the ⚠ above). If the plugin destroys the Unreleased heading at release time, the spec falls back to a small "release-time hook" that re-inserts the heading after `@semantic-release/changelog` runs — a 5-line preCommit step in the .releaserc.json. Low-risk mitigation.

---

## Candidate set B: Projected-version preview (secondary research area #2)

The user's original ask was *"if I push, what version will be deployed to npm?"* — the changelog skill should answer this inline at runtime.

### B1: Shell `npx semantic-release --dry-run --no-ci`

- **Summary**: The skill spawns `npx semantic-release --dry-run --no-ci`, captures stdout, regex-parses the "next version" line.
- **API references (current)**:
  - context7-verified: `--dry-run` "outputs the next version and release notes to the console", skips prepare/publish/addChannel/success/fail.
  - `--no-ci` is documented for local-machine runs.
  - **No documented machine-readable output flag** (no `--json`, no `--output-format`). Stdout is human-readable prose. Parsing is regex-against-prose.
- **Fits**: **Workable but brittle.** Stdout format is not contracted — semantic-release minor versions can shift the wording. A regex on the `(\d+\.\d+\.\d+)` line works today but is at the library's discretion.
- **Tests it enables**: Hard to test deterministically without spinning a tempdir git repo with a known commit set + version tag — slow tests, ~30s per case.
- **Tradeoffs**: Shells out a subprocess (latency: 2-5s). Brittle regex. Adds `npx` to the skill's runtime dependency surface. **Counts against the 300s TTL window.**

### B2: JS API — call semantic-release as a library ✅ RECOMMENDED

- **Summary**: The skill imports `semantic-release` and calls it programmatically with `{ dryRun: true }`. The result is a typed object: `{ lastRelease, commits, nextRelease, releases }`. Read `nextRelease.version` and `nextRelease.type`.
- **API references (current)**:
  - context7-verified: `const result = await semanticRelease({...}, { cwd, env, stdout, stderr })` — `js-api.md` from `/semantic-release/semantic-release`. Returns `{ lastRelease, commits, nextRelease, releases }` or `null` (no release).
  - `nextRelease.version` is the projected semver. `nextRelease.type` is `"major" | "minor" | "patch"`.
  - Allows `stdout`/`stderr` redirect to in-memory buffers, so the skill never pollutes the terminal.
- **Fits**: **Strong.** Native Node ESM, no shelling, latency ~500ms-1s. Returns typed structured data — no regex.
- **Tests it enables**: Fast deterministic tests via a tempdir fixture: write a known commit graph, set HEAD, call the API, assert on `nextRelease.version`. Each test case ~200ms.
- **Tradeoffs**: Adds `semantic-release` to the skill's import surface (currently a devDependency for the release workflow; if the skill imports it at runtime, may need to move to `dependencies` OR document the "ad-hoc preview requires devDeps installed" caveat for `npx @friedbotstudio/create-baseline` consumers).

### B3: Re-implement releaseRules locally

- **Summary**: The skill parses `git log <last-tag>..HEAD` directly, applies the rules in `.releaserc.json → @semantic-release/commit-analyzer.releaseRules` itself, and projects the version without semantic-release at all.
- **API references (current)**: None — this is custom code. Risk: semantic-release's actual analyzer logic is more nuanced than the releaseRules array (e.g., it also applies `preset: "angular"` default rules underneath custom rules). Replicating it without drift is ongoing maintenance.
- **Fits**: **YAGNI fail.** Reimplements what an approved dependency provides — directly forbidden by seed.md "reuse libraries for what they already do".
- **Tests it enables**: Trivially fast.
- **Tradeoffs**: Future semantic-release behavior changes silently desync our preview from the actual release. **Reject on principle.**

---

## Candidate set C: SVG bento-grid + responsive technique (OQ6 + secondary RES #1)

The current architecture SVG is inline in `site-src/index.njk:180-259` with a fixed `viewBox="0 0 940 200"` and 11 nodes on a linear x-axis. The redesign asks for bento-grid composition + mobile responsive.

### C1: Keep linear, viewBox-only responsive (today's approach, extended)

- **Summary**: Keep the linear axis, add `preserveAspectRatio="xMidYMid meet"` (effectively today's default), let the SVG scale proportionally. Add one or two CSS `@media` rules that bump the font-size inside the SVG via class targeting.
- **API references (current)**: MDN — viewBox/preserveAspectRatio is the standard responsive pattern for inline SVG. No surprises.
- **Fits**: **Misses the brief.** The user explicitly asked for bento-grid layout. This option doesn't deliver that.
- **Tests it enables**: Existing pattern.
- **Tradeoffs**: Cheapest path. **Reject** — doesn't satisfy AC7 (bento composition required at 1920px).

### C2: External CSS custom properties + media-query reflow ✅ RECOMMENDED

- **Summary**: The inline SVG declares `<rect>`/`<g>` elements with `x` and `y` attributes driven by CSS custom properties (`x="var(--cell-1-x)"`). The external `site.css` defines those custom properties globally at desktop, then overrides them inside `@media (max-width: 768px)` blocks to reflow into a vertical stack at mobile. Single SVG asset, two layout regimes.
- **API references (current)**:
  - MDN (via WebFetch on the SVG-and-CSS tutorial): **CSS custom properties are the documented modern path for parameterizing inline SVG attributes** — the MDN page explicitly calls this out as the recommended approach. ✓
  - MDN's exact quote: *"to apply different styles to them you should use CSS custom properties."* (Confirmed via WebFetch, https://developer.mozilla.org/en-US/docs/Web/SVG/Tutorial/SVG_and_CSS)
  - **Caveat from the same fetch**: MDN does NOT explicitly document whether `<style>` blocks embedded inside an inline `<svg>` element accept `@media` queries against the OUTER viewport. The safe path is external CSS (which is fully aware of the outer viewport), not embedded SVG `<style>`.
- **Fits**: **Strong.** site.css already exists at `site-src/assets/site.css` (referenced in scout); the gates and node-circles already use CSS classes for fills/strokes. Adding cell-coordinate custom properties is the same lane.
- **Tests it enables**: Playwright snapshots at 320 / 768 / 1920 viewport widths; assert SVG layout cell positions match expected values per breakpoint.
- **Tradeoffs**: Authoring overhead — each cell needs `--cell-N-x` and `--cell-N-y` custom properties declared. For 11 phases + 4 gates + caption layout, ~30 vars. Manageable, but the redesign's `/design-ui` step needs to settle the cell coordinates before tdd builds it.

### C3: Two SVGs (mobile + desktop) selected via CSS display

- **Summary**: Two separate inline `<svg>` elements in `index.njk`, one hidden by `display: none` at the current breakpoint. CSS toggles which is shown.
- **API references (current)**: Trivial CSS — no library issues. Trade-off is purely authoring.
- **Fits**: **Workable but verbose.** Doubles the markup; every future content change requires editing both copies.
- **Tests it enables**: Same Playwright snapshot path.
- **Tradeoffs**: Maintenance burden. Caption text + accessibility title duplicated. **Reject** unless C2 hits a media-query/custom-property compatibility wall.

---

## Decision matrix — secondary OQs

For the smaller decisions where one option is obviously right, given the work above:

| OQ | Decision | Reasoning |
|---|---|---|
| **OQ2 — Category derivation** | **Hybrid (auto-derive + confirm)** | Surface the derived category in one line (e.g. "Category: Added · type [Enter] to accept, or override"); accept blank input → use derived. Matches the keepachangelog spec's "curated, chronologically ordered" framing — curation is a human act, not pure automation. Auto-only loses the multi-category case (the spec is explicit it's silent on this — see keepachangelog 1.0.0 WebFetch result). |
| **OQ3 — Hard-block vs advisory** | **Hard-block via `commit/SKILL.md:8` prereq** | Mirrors the existing archive + memory-flush prereq. No new hook. Reading the harness loop body, a missing `changelog` in `completed` already prevents `/commit` from being seeded as eligible — the prereq is structural, not enforcement. **Article VIII grows zero rows.** |
| **OQ4 — Standalone invocation** | **Yes, allow ad-hoc (no consent gate)** | The skill is read-mostly and writes only `CHANGELOG.md`. Both writes are reversible (a single git checkout undoes). The user's original ask was "what version will be deployed if I push?" — a use case that fires OUTSIDE a workflow. Ad-hoc mode just runs the projected-version computation + prints a draft fragment to stdout; no write unless invoked from harness. |
| **OQ5 — State file** | **Stateful at `.claude/state/changelog/<slug>.json`** | Mirrors `.claude/state/drift/<slug>.md`. Carries `{ projected_version, projected_type, entries, generated_at, source_commit_sha }`. Lets a cross-session resume snapshot pick up the projected version; lets `/commit` Step 4 reference it for the message body. Cheap (<1 KB per workflow). |
| **OQ7 — SessionStart greeting** | **No greeting line** | The greeting in Article III is for configured-vs-unconfigured state, not phase enumeration. Adding a line for every new phase makes the greeting unbounded. Skip. |
| **OQ8 — Hook involvement** | **None** | Coupled to OQ3. Prereq-only enforcement → no hook → Article VIII unchanged. |

---

## Recommendation

Build the `changelog` skill on three load-bearing decisions:

1. **A3** — Append to `CHANGELOG.md` Unreleased section. Stay aligned with keepachangelog 1.0.0; let `@semantic-release/changelog` continue to own version-block insertion at release time. ⚠ Spec needs a 5-line integration test confirming the plugin preserves the Unreleased heading; build a fallback hook IF the plugin destroys it.
2. **B2** — Call semantic-release as a JS API for the projected-version preview. Native Node, structured return, ~500ms latency, fits inside the 300s TTL window with headroom.
3. **C2** — External CSS custom properties + `@media` reflow for the bento-grid SVG. Single SVG asset, two regimes. `/design-ui` settles the cell coordinates; `/tdd` builds against them.

Plus the matrix decisions: hybrid category derivation, prereq-only enforcement (no new hook, no new gate), stateful workflow-state file, ad-hoc invocation allowed.

**What would flip the decision:**
- A3 → A1 (inline body) if the integration test reveals `@semantic-release/changelog` destroys the Unreleased section AND the per-release-cycle re-insertion proves fragile.
- B2 → B1 (shell out) if making `semantic-release` a non-dev dependency turns out to bloat the installed footprint for consumers of `npx @friedbotstudio/create-baseline`. Verify via `npm install --omit=dev` size diff in `/spec`.
- C2 → C3 (two SVGs) if the cell-coordinate parameterization in CSS custom properties hits a browser-compat issue Playwright surfaces at one of the breakpoints.

## Open questions

The spec author still needs to decide:

1. **CHANGELOG.md format migration.** Today's file uses `# [version]` (single hash) under semantic-release. keepachangelog uses `## [version]` (double hash). The migration is a one-line `sed`; do we ship it inside this workflow (single-commit hygiene) or as a follow-up chore?
2. **Compare-link footer maintenance.** keepachangelog mandates `[1.1.1]: https://github.com/.../compare/v1.1.0...v1.1.1` at the file foot. Does the skill maintain these, or does `@semantic-release/changelog` already? (Needs a glance at the plugin source — out of scope for context7.)
3. **Bento cell-count and shapes for C2.** 4×3 (12 cells) vs asymmetric (variable sizes). The intake OQ6 left this for `/design-ui`. The spec should declare a `## Design calls` row pointing `/design-ui` at it.
4. **Hero-symbol responsive audit.** The intake AC6 names "the SVG" singular; AC7 names the architecture SVG specifically. Do we also responsive-audit the six hero SVGs in `site-src/_includes/hero-symbols/`? Recommend: yes, but in a single mechanical pass after C2 lands.
5. **Phase numbering — 11.5 vs new row 12.** Scout flagged this. Recommend: keep "Phase 11" unified and append a "Phase 11.5 — Changelog" sub-row, mirroring the existing 10.5/10.6 pattern. No phase renumbering downstream.
