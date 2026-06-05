---
owners: [research]
category: validated library APIs
size-cap: 500
key: lib@version
verifies-against: lockfile + context7
---

# Validated library APIs

Library APIs the team has confirmed via `context7` MCP against the version present in this repo's lockfile. Saves a context7 round-trip when a stable choice is referenced again.

Each entry's stable key is `<lib>@<version>`. If the lockfile bumps, re-verify and update the version.

---

## context7@mcp

- Role: live library documentation MCP server. Used by `research`, `implement`, `security`, `spec` for any third-party API lookup.
- API: `mcp__plugin_context7_context7__resolve-library-id` then `mcp__plugin_context7_context7__query-docs`
- Verified-at: HEAD
- Last-touched: 2026-04-27
- Caveat: declared in `.mcp.json` at repo root. Travels with the repo; no plugin install required.

## @11ty/eleventy@3.1.5

- Role: static site generator for the marketing site. Reads `site-src/`, writes `site/`.
- Config file: `eleventy.config.cjs` at project root. `.cjs` extension is mandatory because the root `package.json` declares `"type": "module"`. Returns `{ dir, templateFormats, htmlTemplateEngine, markdownTemplateEngine }` plus an `addPassthroughCopy({ "site-src/assets": "assets" })` call.
- Layout dirs: `site-src/_layouts/` for layouts, `site-src/_includes/` for partials, `site-src/_data/` for site-wide JSON data. Pages reference layouts via frontmatter `layout: base.njk` / `layout: docs.njk`.
- Scripts: `npm run build:site` (one-shot), `npm run dev:site` (watch + serve on `:4321` with hot reload).
- Verified-at: HEAD
- Last-touched: 2026-04-29
- Caveat (config filename): the legacy `.eleventy.cjs` filename is NOT recognized in 3.x. Must be `eleventy.config.cjs` (or `.eleventy.js` for ESM). Misnaming silently falls back to defaults and fails layout resolution with confusing "layout does not exist" errors.
- Caveat (imperative API): some 2.x setters were removed in 3.x (`setHtmlTemplateEngine`, `setMarkdownTemplateEngine`). Use the return-value config object for those instead of imperative method calls.

## semantic-release@25.0.3

- Role: the release pipeline driver — runs the plugin chain (commit-analyzer → release-notes → changelog → npm → git → github) on CI to compute next version, generate notes, publish to npm, and tag. Configured in `.releaserc.json` at project root.
- Plugin chain (current): `@semantic-release/commit-analyzer` → `@semantic-release/release-notes-generator` → `@semantic-release/changelog@6.0.3` → `@semantic-release/npm` → `@semantic-release/git@10.0.1` → `@semantic-release/github`.
- Branches config: this repo's `.releaserc.json` declares `branches: ["main"]` and caps via `releaseRules` (see commit-analyzer entry); the `branches` field accepts strings, regex objects, and channel/range/prerelease objects but in this repo it's a flat string array.
- Scripts: invoked via `npm run release` (mapped to `semantic-release` in `package.json → scripts.release`) inside the release CI job.
- Verified-at: 01780d7
- Last-touched: 2026-05-14
- Caveat: v25 requires Node ≥ 20.8.1; CI must run on a recent enough Node. The plugin chain is order-sensitive — `commit-analyzer` must run first (determines release-or-not + bump type), and `git` must run before `github` so the tag exists when GitHub release is created. Trusted-publisher OIDC for npm is a parallel concern handled in the workflow YAML, not in `.releaserc.json`.

## @semantic-release/commit-analyzer@13.0.1

- Role: the first plugin in the semantic-release chain. Parses commits since the last release and decides (a) whether to release at all and (b) the bump type (major / minor / patch) using `releaseRules`. Configured under `plugins[]` in `.releaserc.json` with optional `preset` + `releaseRules` array.
- `releaseRules` shape: an array of objects each matching commits and assigning a `release` verdict. Match keys: `type`, `scope`, `breaking: true`, `revert: true`, `subject`, `header`, `body`, `message` (the last three accept micromatch globs). Verdict values: `"major"` / `"minor"` / `"patch"` / `false` (suppress release for matching commits).
- This repo's usage: `releaseRules` is used to (1) cap `main`-branch releases at 0.x by remapping `breaking: true` to `minor`, and (2) exclude maintenance scopes (e.g. `release`) from triggering a release — the "scope-based filtering" topic queried 24+ times this session.
- Rules are evaluated in array order; the first match wins. To suppress a commit, place its rule before any catch-all.
- Verified-at: 01780d7
- Last-touched: 2026-05-14
- Caveat: `releaseRules` extends but does NOT replace the default preset rules (Angular convention by default) — defaults still apply for commits no custom rule matches. To make a scope explicitly NOT trigger a release, you need an explicit `{scope: "<name>", release: false}` entry that fires before the default `feat`/`fix`/`BREAKING CHANGE` rules. The minor-cap-on-breaking trick (`{breaking: true, release: "minor"}`) only works because rules are evaluated before the preset; it is the documented v0.x safety belt.

## @semantic-release/changelog@6.0.3

- Role: release-time plugin in the semantic-release chain. Runs in the `prepare` step; inserts the release notes (built upstream by `@semantic-release/release-notes-generator`) into `CHANGELOG.md`. Configured at `.releaserc.json:20` with `{changelogFile: "CHANGELOG.md"}`.
- Empirical behavior (verified by `.claude/skills/changelog/tests/keepachangelog-unreleased-preserved_test.mjs:1` during the changelog-skill-and-responsive-svgs workflow): does NOT preserve the `## [Unreleased]` heading position at the top of the file. The plugin prepends `nextRelease.notes` ABOVE the file's existing content (including `# Changelog` and `## [Unreleased]` headings). The Unreleased heading survives in the file body — just displaced downward.
- Companion: `.claude/skills/changelog/unreleased-writer.mjs:1` exports `reinsertUnreleasedHeading(changelogPath)` as the release-time fallback that lifts the heading back to canonical top position. Not yet wired into `.releaserc.json` as a post-prepare step; deferred to a follow-up workflow once the AC-013 integration test confirms wiring shape.
- Verified-at: 25d9eb4
- Last-touched: 2026-05-18
- Caveat: the plugin's prepend behavior is documented empirically here because context7 did not surface the seam at research time. The fallback `reinsertUnreleasedHeading` is therefore mandatory if the workflow wants keepachangelog 1.0.0 conformance after release-time runs. A future hardening tick would wire the fallback as a `.releaserc.json` post-prepare plugin entry.

## nunjucks@3.2.4

- Role: template engine for every `.njk` file in `site-src/`. Drives layouts, includes, frontmatter variable substitution.
- Eleventy 3.x dropped Nunjucks from its transitive dependencies. Install explicitly: `npm install -D nunjucks`. Without it, Eleventy fails at startup when it tries to render any `.njk` template.
- Frontmatter convention: `layout: <name>.njk` (full filename with extension). Includes use `{% include "<name>.njk" %}`.
- Verified-at: HEAD
- Last-touched: 2026-04-29
- Caveat: not the same package as `@11ty/nunjucks` (which is an Eleventy fork at 4.x-alpha). Use the upstream `nunjucks` package; that's what 11ty 3.x's internal Nunjucks engine imports.

## @clack/prompts@1.4.0

- Role: terminal prompt primitives behind the branded TUI in `src/cli/tui/*`. The first and only runtime dependency declared in `package.json`. Imported via dynamic `await import('@clack/prompts')` from `bin/cli.js` so it loads only on the `process.stdout.isTTY === true` branch; non-TTY invocations never execute clack code.
- API surface used: `intro(msg)`, `outro(msg)`, `cancel(msg)`, `spinner()` returning `{start, message, stop, error, cancel}`, `select({message, options})`, `log.{info,warn,error,success,step}`, `isCancel(value)`. Verified via `context7 /bombshell-dev/clack` query during the branded-cli-tui workflow.
- Transitive closure (6 packages total): `@clack/core@1.3.1`, `fast-wrap-ansi@0.2.0`, `fast-string-width@3.0.2` (+ `fast-string-truncated-width@3.0.3`), `sisteransi@1.0.5`. `npm audit --omit=dev` clean at adoption time.
- Test seam: every `src/cli/tui/*` `run({...})` accepts an optional `prompts` parameter that defaults to the real `@clack/prompts` module; tests inject a stub object capturing intro / outro / spinner / select / isCancel calls without needing a pseudo-TTY. Cancel sentinel for `isCancel` is `Symbol.for('clack:cancel')`. See `tests/tui-install.test.mjs:23-49`.
- Verified-at: db291ed
- Last-touched: 2026-05-18
- Caveat: empirical probe at branded-cli-tui `/tdd` Step 0 confirmed clack emits Unicode framing bytes (≈41 B for a minimal intro+log+outro) to **non-TTY stdout** — clack does NOT silently degrade. The architecture's TTY-vs-plain router (`bin/cli.js → dispatchInstall/dispatchUpgrade/dispatchDoctor`) routes around clack on the non-TTY path; never invoke clack inside a path that may run non-TTY without the explicit `process.stdout.isTTY` guard. The exact-version pin (`"1.4.0"`, no caret) is part of the supply-chain contract enforced by `scripts/check-files-diff.mjs → DEPS_ALLOWLIST`.

## node:test@node-25.8.1

- Library: Node.js built-in test runner (`node --test`), runtime `node@25.8.1` (engines `>=18.17.0`).
- Role: the project test runner (`npm test` = `node --test --test-reporter=spec tests/*.test.mjs`). API facts verified via context7 `/nodejs/node/v25.9.0` during the reduce-test-suite-runtime workflow.
- Key API: **`--test-concurrency`** defaults to `os.availableParallelism() - 1` when isolation is `process` (the default) — so the CLI suite ALREADY runs test FILES in parallel with no flag; a serial run needs explicit `--test-concurrency=1`. **`--test-isolation=process`** (default) runs each test FILE in its own child process — an in-process module-level cache (e.g. a memoized build promise) does NOT cross files; cross-file sharing needs `--test-global-setup` or a known on-disk fixture path. **`--test-global-setup=<module>`** runs an exported `globalSetup`/`globalTeardown` ONCE before/after all files (throw in globalSetup → no tests run, non-zero exit). Env set in globalSetup does not reliably propagate to isolated child processes — share via a fixed fixture PATH, not env.
- Verified-at: a493cdb
- Last-touched: 2026-06-05
- Caveat: `--test-global-setup` build-once was attempted (Candidate B) and reverted — see backlog `reduce-test-suite-wall-clock-blocked-on-global-build-mutex`. It regressed badly because `scripts/build-template.sh` holds a machine-global mkdir mutex (`$TMPDIR/create-baseline-build.lock.d`) that serializes ALL builds; build-once only pays off once that mutex is per-PKG_ROOT or a build-free shared fixture is used. The default-parallel run is intermittently flaky ONLY when a test WRITES the live `obj/template` (npm pack → prepack); gate or `--ignore-scripts` those writers and parallel is deterministic (see landmine `live-objtemplate-rebuild-races-parallel-test-readers`).

## @stryker-mutator/core@9.6.1

- Library: Stryker mutation-testing engine (`@stryker-mutator/core`), exact-pinned devDependency. The mutation-oracle (`-f029`) uses it.
- Role: dev-only, advisory test-quality oracle (`npm run test:mutation -- <module> <testPath>` → `scripts/mutation-oracle.mjs`). Never a runtime dependency; never ships to consumers (AC-007).
- Key API (context7 `/stryker-mutator/stryker-js`, verified 2026-06-05): `testRunner: 'command'` + `commandRunner.command` runs an ARBITRARY test command, so it drives the bare `node --test` suite (no Jest/Mocha/Vitest). **`coverageAnalysis: 'perTest'` is NOT supported by the command runner** (only Mocha/Jasmine/Karma/Jest plugins) → must be `'off'`, so every mutant re-runs the whole configured command; bound cost by scoping `mutate: ['<one file>']` + a command that runs only that module's test. `reporters: ['json']` writes `reports/mutation/mutation.json` (schema: mutation-testing-report-schema; survivors = mutants with `status: 'Survived'`). `--incremental` re-tests only changed mutants.
- Verified-at: 97ead55
- Last-touched: 2026-06-05
- Caveat: install pulls ~27 direct deps; introduces ONE moderate audit finding (`qs` via `typed-rest-client`, Stryker's optional dashboard reporter — unreachable with `reporters:['json']`). The CRITICAL liquidjs finding seen at install time is PRE-EXISTING via `@11ty/eleventy`, not Stryker (backlog `bump-eleventy-fix-liquidjs-critical-rce-vuln-8caf`). Exact-pin required (`9.6.1`, no caret) per `check-files-diff DEVDEP_RANGE_FORBIDDEN` — see convention `devdeps-exact-pinned-and-tests-not-strictly-co-named`. `reports/` + `.stryker-tmp/` are gitignored.
