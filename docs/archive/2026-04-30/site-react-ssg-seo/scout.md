# Codebase Scout Report — site-react-ssg-seo

Scope: rebuild `site/` as a React + SSG project deployed to nginx, multi-page (Home + Hooks + Memory + Skills core/third-party + Swarm), static-by-default with React islands, treat existing `app.jsx` as visual reference only. Intake: `docs/intake/site-react-ssg-seo.md`.

## Primary touchpoints

- `site/index.html:1` — current single-page entrypoint. 1,250 lines, 41 KB. `<head>` lines 4–14 hold the existing SEO surface (title, description, favicons, manifest, fonts). Lines 15–1239 are inline `<style>` (1,223 CSS lines, single-theme light, custom-property based). Lines 1241–1249 are `<body>`: a skip link, `#root`, then four `<script>` tags loading React 18.3.1 + React-DOM 18.3.1 + `@babel/standalone@7.29.0` from unpkg, then `assets/src/app.jsx` as `type="text/babel"`. The Babel-in-browser pipeline is the runtime AC #1 says must be removed.
- `site/assets/src/app.jsx:1` — the visual reference layer. 58 KB. Mounts at `site/assets/src/app.jsx:1377` (`root.render(<App />)`). Composition (line numbers below). All components consume CSS custom properties from the inline style block in `index.html`; none import their own styles.
  - L4–37 — `DATA`: `SECTIONS` (4 IDs), `TOC_TREE` (nested), `GLANCE` (six counted callouts).
  - L40 — `CopyButton` (clipboard interaction).
  - L72 — `useScrollSpy` (IntersectionObserver hook, threshold/rootMargin tuned for sticky-nav offset).
  - L106–148 — `GithubIcon`, `Topnav`.
  - L151 — `Sidebar` (driven by activeSectionId).
  - L182 — `TOC` (nested table of contents).
  - L210 — `HeroChip`, L224 — `PIPELINE_PHASES` data, L242 — `PipelineSubwayMobile`, L438 — `PipelineSubway` (large composition; mobile and desktop variants).
  - L609 — `Masthead` (the bicolor headline DESIGN.md describes).
  - L680–771 — `TopologyPlate`, `RULES`, `Principle`.
  - L778, L807 — `HOOK_WRITE_BOUNDARY` (15 entries) and `HOOK_LIFECYCLE` (3 entries) — content for the new Hooks page (note: needs a 4th lifecycle/input-boundary entry to match current 19-hook truth — see Risks).
  - L812, L826 — `HookCol`, `HookBoundaryGrid`.
  - L857, L868 — `SKILL_CATEGORIES`, `SkillCatalog` — content for the new Skills page.
  - L894 — `Pipeline` section.
  - L946–1215 — `MemoryFlowPlateMobile`, `MemoryFlowPlate` — content for the new Memory page.
  - L1216 — `Memory` section.
  - L1248, L1265 — `DevWindow`, `Adoption` (install instructions; references `git clone https://github.com/anthropics/claude-code-baseline …` — the URL is a stub and points nowhere real).
  - L1311 — `SPY_IDS` (scroll-spy targets).
  - L1342 — `App` (top-level layout).
- `site/assets/brandmark.png`, `brandmark@2x.png`, `brandmark.svg` — brand mark, three formats. AC #10 pins these.
- `site/assets/favicon/{favicon-16x16.png,favicon-32x32.png,favicon.ico,apple-touch-icon.png,android-chrome-192x192.png,android-chrome-512x512.png,site.webmanifest}` — full favicon set. AC #10 pins these.
- `DESIGN.md:1` — design contract. 23 documented `--*` CSS custom properties spanning type families (display: Plus Jakarta Sans 800; body: Inter; mono), color (true neutrals + ink + accent), spacing scale, layout widths, motion vocabulary, accessibility floor. Single-theme light. The build (and AC #6) treat this as the authoritative token source — `site/index.html`'s inline CSS currently duplicates these tokens and that duplication is the drift AC #6/#8 forbid.

## Wiring touchpoints (must move in lockstep with this work)

- `.claude/project.json → workflow.artifacts.document` is currently `null`. Per `docs/init/seed.md:588` and `:597`, this was nulled when stale `docs/site/` references were removed. **The new build must populate this with a path that matches the chosen output dir** (e.g., `site/dist/**` or `site/build/**`) so `/document` runs against the live site. Spec must decide the path.
- `.claude/project.json → tdd.source_globs` already includes `site/assets/src/**`. If the new build moves source under a different root (e.g., `site/src/`), spec must extend `source_globs` accordingly or align the source dir to the existing glob.
- `.claude/project.json → tdd.exempt_globs` already exempts `site/assets/brandmark*` and `site/assets/favicon/**` (binaries). Build outputs (`site/dist/**` or equivalent) will need to be added to `exempt_globs` so the TDD-order guard does not demand tests for generated files.
- `package.json → files` is `["bin/", "src/", "template/", "README.md"]`. AC #11 (build output excluded from npm tarball) is satisfied by this allow-list as written — adding the build dir would break AC #11. The constraint is to **not** add the build output here.
- `package.json → scripts` has `build`, `prepack`, `test`. `build` and `prepack` are bound to `bash scripts/build-template.sh`. AC #1 needs a documented site-build command — spec must decide whether to add a sibling script (`build:site`) or rename, without breaking the prepack chain.
- `scripts/build-template.sh:28` already excludes `site/` from the rsync that produces `template/`. The CLI scaffolder ships without the site, which is correct and consistent with `package.json → files`. **Do not remove this exclude.**
- `.gitignore:1` — ignores `.claude/state/`, `.claude/memory/_pending.md.body`, `.claude/memory/_resume.md`, `.claude/agent-memory/`, `.claude/skill-memory/`. Build outputs are not currently ignored. Spec must decide whether to ignore the dist directory (likely yes) or commit it.

## Entry points that reach this code

Today there is no entry point: the site is opened by pointing a browser at `site/index.html` directly (or by serving `site/` over a local static server). After this work, the entry points are:

- The chosen build command (e.g., `npm run build:site`) — to be defined in the spec.
- An nginx `server` block serving the chosen output directory (greenfield — no existing nginx config in this repo). Spec must decide whether the nginx config is committed alongside the build output as a sample (and where it lives).
- The deployed URL pattern reaches static HTML at the deploy root (`/`, `/hooks/`, `/memory/`, `/skills/`, `/skills/core/`, `/skills/third-party/`, `/swarm/` — exact URL shape per AC #14 / spec).

## Existing tests

- `tests/` contains 10 `.test.mjs` files: `build-template`, `cli`, `conflict`, `install`, `io`, `manifest`, `mcp`, `merge`, `plantuml`, `util`. None reference `site/`, `index.html`, `app.jsx`, the brand mark, or the favicons (`grep -lE 'site/|index\.html|app\.jsx' tests/*.test.mjs` returns nothing).
- The runner is `node --test --test-reporter=spec tests/*.test.mjs` (per `package.json`). Whatever site tests land must use the same runner or be invoked by a separate script the spec defines.
- `bash .claude/skills/audit-baseline/audit.sh` is the project's `test.cmd`. It does not currently audit `site/` (only verifies that **stale `docs/site/` refs do not appear** — `audit.sh:715–752`, `quickfix-5`). It will not catch site regressions today. Spec should decide whether to extend it or layer a separate site-build verification.

## Constraints and co-changes

- **`workflow.artifacts.document` flip** (`null → site/<output-dir>/**`) — required for `/document` to run against the rendered surface. Touch points: `.claude/project.json`, `audit.sh`, `init-project.md`, `seed.md` (the same set called out in `seed.md:597`). Whatever path is chosen for output must update all four.
- **Pinned counts in marketing copy must derive from a single source.** Today's `app.jsx:31–36` `GLANCE` claims `Hooks: 16, Skills: 35, Subagent: 1, Commands: 4, MCPs: 3, Memory files: 6`. Today's truth (CLAUDE.md, README.md, filesystem, `.claude/settings.json`): **19 hooks, 36 skills, 1 subagent, 4 consent/bootstrap commands, 3 MCP servers, 6 canonical memory files (+ 2 transient: `_pending.md`, `_resume.md`)**. The site's `<meta name="description">` (`site/index.html:7`) embeds the same stale numbers. Spec needs to define a build-time data-source rule (e.g., read counts from `package.json`, `.claude/settings.json`, and a directory listing) so this never re-drifts.
- **`audit.sh:715–752 quickfix-5`** forbids `docs/site/` refs in scoped baseline files. The new build lives at `site/`, not `docs/site/`, so it does not conflict — but spec must avoid reintroducing `docs/site/` paths anywhere.
- **DESIGN.md is read-only for this work.** It is the contract; no token redefinition. Components apply tokens; they do not declare new ones.
- **No `node_modules` exists yet.** The repo is dependency-free at the project level (package.json has no `dependencies` / `devDependencies`). Adopting an SSG introduces the first project-level deps. Spec must decide whether `node_modules` lives at repo root (affects `.gitignore`, `package.json → files`) or scoped under `site/`.
- **Settings.json has 20 hook entries because `git_commit_guard.sh` is registered twice** (once on `PreToolUse:Bash`, once on `PreToolUse:Edit|Write|MultiEdit`) — see `MM` cross-check above and `CLAUDE.md` Article VIII row for `git_commit_guard`. This is by design. The Hooks page must present the canonical 19-script count, not 20 wirings.

## Patterns in use here

- **Single-source design tokens via CSS custom properties** (DESIGN.md → CSS `:root` block in `site/index.html:18–~150`). Components in `app.jsx` reference tokens via class names; no per-component token declarations.
- **Plain function components with hooks**, no class components. State is local; no global store. The only cross-component coupling is `useScrollSpy` driving the `Sidebar`'s `activeSectionId` prop.
- **Mobile/desktop split as separate components** (`PipelineSubwayMobile` / `PipelineSubway`, `MemoryFlowPlateMobile` / `MemoryFlowPlate`) rather than CSS-only responsive variants. Reuse decision: the desktop variants of the heavy plates are the visual cue to preserve; the mobile variants are content-equivalent reflows.
- **Inline SVG for icons and pipeline ornaments** — no icon library. Reused literally where icons recur (`GithubIcon`).
- **No router.** The current page is one anchor-linked SPA. The new multi-page shape will need a router-or-equivalent at the SSG level (this is a research question, not a scout finding).
- **Naming.** Files are kebab-case where they exist; component names are PascalCase; data constants are SCREAMING_SNAKE. Sections are integer-prefixed (`§ 01`, `§ 02`) in code comments only; URL anchors are plain kebab-case (`principle`, `pipeline`, `memory`, `adoption`).

## Risks / landmines

- **Stale counts in production copy.** Three places drift today: `site/index.html:7` `<meta description>` ("16 hooks, 35 skills"), `site/assets/src/app.jsx:31–36` `GLANCE` array (Hooks 16, Skills 35), and `app.jsx:778, 807` (`HOOK_WRITE_BOUNDARY` lists 15 + `HOOK_LIFECYCLE` lists 3 → 18, off-by-one vs the 19 truth). Reuse without fixing carries the bug forward.
- **Webmanifest path mismatch.** `site/assets/favicon/site.webmanifest:1` declares icons as `/android-chrome-192x192.png` and `/android-chrome-512x512.png`. The actual files live at `/assets/favicon/android-chrome-*`. Currently the manifest icon paths resolve against `/`, so they 404 in production. AC #10 requires keeping the favicon files unchanged but does not forbid fixing the manifest contents — spec should decide whether the manifest itself counts as "brand asset" (immutable) or "site config" (must be corrected).
- **Empty PWA fields in webmanifest.** `site/assets/favicon/site.webmanifest:1` has `name: ""` and `short_name: ""`. Same disposition question as above.
- **Adoption section's install URL is a placeholder.** `app.jsx:1267` references `git clone https://github.com/anthropics/claude-code-baseline .baseline` — there is no such public repo. This package ships as `npx create-baseline` per `package.json:7`. Reauthoring should align Adoption copy with the actual install surface (`npx create-baseline …`).
- **`site/assets/` has `.DS_Store` files committed** (`site/assets/.DS_Store`, `site/assets/src/` parent). Macos noise. Not in `.gitignore`. Build pipeline should exclude these from any copy step; spec should add to `.gitignore`.
- **Heavy CSS coupling.** All 1,223 CSS lines live in one `<style>` in `index.html`. Components in `app.jsx` reference class names that only exist there. Reuse-by-extraction (versus reauthor-fresh) means the CSS extraction surface is significant. The intake explicitly says "treat as visual layer; reuse what you can," and the cleanest reuse boundary is `DESIGN.md` tokens + section-level layout patterns, not the raw stylesheet.
- **No analytics/search/fonts-self-hosted decisions made.** Fonts currently load from `fonts.googleapis.com` and `fonts.gstatic.com` (`index.html:11–13`). Self-hosting fonts versus the current Google Fonts request is a perf+privacy fork that the spec should resolve against the nginx-deploy reality.
- **No image-optimization story.** `brandmark.png` is 5.3 KB, `@2x.png` is 11 KB — both small enough that optimization is optional. The favicon set is a pre-rendered standard set. There is no story for OG images yet (AC #2 requires them) — those need to be authored, sized, and committed during implementation, not produced by build.
- **`audit-baseline` will not see site regressions.** It checks the harness layer, not the site. If counts drift on the site after this work lands, no test catches it. Spec should decide whether to extend `audit.sh` (or a new audit) to verify site counts against ground truth.
