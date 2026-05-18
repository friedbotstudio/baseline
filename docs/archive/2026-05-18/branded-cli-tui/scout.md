# Codebase Scout Report — branded-cli-tui

Scope: branded TUI across install, doctor, and a new `upgrade` subcommand that replaces today's `--merge` flag. Sources at `src/cli/*`, entrypoint at `bin/cli.js`, brand surface at `site-src/assets/site.css`.

## Primary touchpoints

- `bin/cli.js:1-253` — argv parser + routing + HELP_TEXT. Single `main(argv)`; flags wired via `node:util parseArgs`. Today's `--merge` branch lives at lines 187-215; the `doctor` subcommand routes at lines 127-133. Help text is a hardcoded template literal at lines 19-61.
- `src/cli/io.js:1-27` — output seam. `log` / `warn` / `error` (writes to stdout/stderr with prefixes), `ask` (readline prompt), `isTTY` constant (reads `process.stdin.isTTY` only). Every terminal byte the CLI emits flows through here. **Primary swap surface for clack integration.**
- `src/cli/install.js:1-103` — `freshInstall`, `forceInstall`; emits no output of its own (callers `io.log` after the promise resolves). `NEVER_TOUCH`, `SPECIAL_MERGE`, `COPY_EXCLUDE` constants control the copy filter. The npmrc materialization is opt-in via `opts.withNpmrc`.
- `src/cli/merge.js:1-107` — `threeWayMerge(templateDir, target, oldManifest, newManifest)` returns `{actions, exitCode}` with the `ACTION_KINDS` enum at lines 8-18 (ADD / OVERWRITE / NOOP / SKIP_CUSTOMIZED / PRUNE / PRUNE_SKIPPED_CUSTOMIZED / NEVER_TOUCH_PRESERVE / NEVER_TOUCH_ADD / SPECIAL_MERGE). Non-interactive today; the upgrade TUI's interactive choices map onto this function (or wrap it with a pre-pass that decides each action).
- `src/cli/doctor.js:1-152` — `runDoctor(target, options)` returns a typed report `{exitCode, strict, target, matched, customized, missing, added, tampered}`. `formatReport(report)` is the human-readable formatter at lines 114-152. **Clean structured/presentation split — the TUI replaces `formatReport`, leaves `runDoctor` untouched.**
- `src/cli/manifest.js:1-38` — `hashFile`, `loadManifest`, `saveManifest`, `buildManifestFromDir`. Used by install, merge, doctor — unchanged scope.
- `src/cli/conflict.js:1-31` — `scanSentinels(target)` returns the array of sentinel paths present. Drives the "existing baseline detected" branch at bin/cli.js:167.
- `src/cli/plantuml.js:1-121` — `fetchPlantumlIfMissing` with sha256 pin. Outcome enum (`FETCH_OUTCOMES`) drives bin/cli.js:233-239 warnings and exit-code-4 handling.
- `src/cli/mcp.js:1-54` — `deepMergeMcpServers` for `.mcp.json`. Out of TUI scope.
- `src/cli/util.js:1-10` — `pathExists`. Out of scope.
- `package.json:4` — `description` field carries the "Zero-dependency" claim. `dependencies: {}` is currently empty.
- `package.json:7-12` — `files: ["bin/", "src/", "obj/template/", "README.md"]`. Any new `src/cli/tui/*` module ships automatically via the `src/` glob.
- `README.md:1-30` — top-of-README positioning carries the brand register. The "Installation" / "Quickstart" anchors document the flag-driven invocation today.
- `site-src/assets/site.css:10-66` — `:root` palette and brand tokens (oklch). Source of truth for Friedbot Studio house style. Notable tokens: `--accent` (orange-700, `oklch(55.8% 0.187 41.5)`), `--accent-light` (orange-500), `--ink`, `--text`, `--charcoal`, `--muted`, plus dev-console-specific tokens (`--code-bar-bg`, `--cli-success`, `--mac-red`, `--tok-*`).

## Entry points that reach this code

- `npx @friedbotstudio/create-baseline <target> [...flags]` — invokes `bin/cli.js` via the `bin` field in `package.json:7`. `main(process.argv)` at bin/cli.js:250.
- `npx @friedbotstudio/create-baseline doctor [target] [--strict]` — same entrypoint; subcommand routed at bin/cli.js:128.
- Future: `npx @friedbotstudio/create-baseline upgrade [target] [...flags]` — net-new positional, routed in `bin/cli.js` alongside `doctor`.
- Programmatic: `freshInstall` / `forceInstall` / `threeWayMerge` / `runDoctor` are individually exported and consumed by tests (no other external consumers in this repo).

## Existing tests

- `tests/cli.test.mjs` (115 LOC) — child-process invocation of `node bin/cli.js`. Covers: `--help`, `--version`, unknown flag → exit 2, missing target → exit 2, `--force`+`--merge` mutual exclusion, `--no-plantuml`+`--require-plantuml` mutual exclusion, fresh install on empty target, conflict refusal without `--force`/`--merge` (exit 1), `--force` in non-TTY → exit 2, `--dry-run` on conflict.
- `tests/install.test.mjs` (224 LOC) — direct calls to `freshInstall` / `forceInstall`. Covers full-tree copy, manifest write, npmrc opt-in, `.claude/project.json` NEVER_TOUCH, `.mcp.json` SPECIAL_MERGE, `manifest.json` excluded from target root.
- `tests/merge.test.mjs` (171 LOC) — direct calls to `threeWayMerge`. Covers every `ACTION_KIND` plus NEVER_TOUCH/SPECIAL_MERGE behavior.
- `tests/doctor.test.mjs` (267 LOC) — direct calls to `runDoctor` + `formatReport`. Covers clean / customized / missing / added / no-manifest / strict / TAMPERED label rendering / v2 manifest tolerance.
- `tests/io.test.mjs` (64 LOC) — log/warn/error stream targets + trailing newlines, `ask` trim behavior, `isTTY` mirror.
- `tests/conflict.test.mjs`, `tests/plantuml.test.mjs`, `tests/manifest.test.mjs` — exist and cover their respective modules.
- `tests/template-payload.test.mjs`, `tests/build-template.test.mjs`, `tests/template-drift.test.mjs` — assert the shipped tree shape. The CLI source (`src/cli/*`) ships in the tarball but is not part of the template payload; these stay green as long as `scripts/build-template.sh`'s allowlist isn't disturbed.

All passing today (last `bash .claude/skills/audit-baseline/audit.sh` exited 0 per recent commits).

## Constraints and co-changes

- **`package.json:4` description** must lose "Zero-dependency". Touched by `tests/cli.test.mjs:39` (`test_when_cli_invoked_with_help_then_help_text_documents_with_npmrc`) only insofar as help text content changes — that test asserts the `--with-npmrc` line is present, not the description.
- **`package.json` `dependencies` block** flips from `{}` to `{ "@clack/prompts": "<pinned>" }`. `npm pack`'s prepack runs `scripts/build-template.sh`; that script does not touch the CLI source, so no manifest churn.
- **`scripts/build-template.sh`** uses an allowlist and stamps `obj/template/manifest.json`. The CLI source isn't in the template — no rebuild needed for src/cli/* changes.
- **`bin/cli.js` HELP_TEXT** — hardcoded template literal needs `upgrade` subcommand documentation, and `--merge` documentation updated per the spec's back-compat choice.
- **Exit-code contract** at `bin/cli.js:55-60` (the help text's own exit-code table) is part of the public surface. Existing exit codes: 0 / 1 / 2 / 3 / 4. The `upgrade` subcommand SHOULD preserve `3` for "skipped customizations" (today's `--merge` semantics) so CI consumers don't have to relearn. New exit codes for "user aborted upgrade" need a slot.
- **TTY detection asymmetry** — `src/cli/io.js:15` reads `process.stdin.isTTY`; `bin/cli.js:174` and `bin/cli.js:188` also read `process.stdin.isTTY`. `@clack/prompts` keys off `process.stdout.isTTY` by default. The TUI degrade-to-plain decision needs to be made on one consistent stream — picking `process.stdout.isTTY` matches clack and most CLI conventions, but flipping the check is a behavior change that touches `--force`/`--merge` non-TTY refusals. Spec to lock the rule.
- **README.md** — positioning paragraph + `Installation` / `Quickstart` sections reference the flag-driven invocation. `/document` (Phase 10) updates these per the spec's chosen back-compat path.
- **`docs/init/seed.md` §16** (per CLAUDE.md Article III) — if `/init-project` reads anything CLI-related from seed.md, check before the spec lands. (Out-of-scope for scout; flagged for spec.)

## Patterns in use here

- **Pure ESM, Node 18+ APIs only.** `node:fs/promises`, `node:path`, `node:util parseArgs`, `node:readline/promises`. No transpile step, no CJS interop.
- **Clean structured/presentation split.** `runDoctor` returns a typed object; `formatReport` is the text formatter. `threeWayMerge` returns `{actions, exitCode}` — actions are data, formatting is the caller's job. **This is the seam the TUI rides on.**
- **`io` module is the single output seam.** Every byte to stdout/stderr passes through `io.log/warn/error`. The cleanest TUI swap replaces (or wraps) `io.log/warn/error` and adds new TUI-aware helpers (`section`, `step`, `outro`) — the rest of the codebase stays unchanged.
- **Functions resolve void; errors throw or return non-zero exit codes via the caller.** No callback-style; no eventemitter.
- **Constants exported alongside functions.** `ACTION_KINDS`, `FETCH_OUTCOMES`, `SENTINEL_PATHS`, `NEVER_TOUCH`, `SPECIAL_MERGE`, `COPY_EXCLUDE` — every magic value is a frozen object/array.
- **Tests use real fs in temp dirs.** No mocks of internal modules (per Article VI.3); install/merge/doctor tests build real template trees and assert on disk.

## Risks / landmines

- **TTY stream asymmetry** (stdin vs stdout) — see Constraints. Lock in spec; will surface as a test if not.
- **`io.ask` swap target** — today's `'overwrite'` / `'merge'` literal confirmations are strict string matches. `@clack/prompts confirm()` returns boolean; mapping it to today's "type the magic word" UX means either keeping the readline `ask` for those confirmations or accepting the UX change at spec time.
- **Brand token translation** — site palette is oklch. Terminal palettes are 256-color or 24-bit RGB. The spec needs a clear rule for oklch → hex (or named ANSI) so the TUI's "Friedbot Studio orange" doesn't drift from the docs site's orange. Likely a small table in `src/cli/tui/tokens.js`.
- **Spinner / progress under non-TTY** — `@clack/prompts spinner()` no-ops in non-TTY but still emits start/stop messages. CI logs may pick those up. Verify the silent-degrade behavior empirically at spec time.
- **Help-text growth** — bin/cli.js's HELP_TEXT is already 43 lines. Adding `upgrade` + interactive flags will push it past a comfortable single screen. Consider a per-subcommand `--help` (`create-baseline upgrade --help`) instead of one monolith.
- **HELP_TEXT hardcoded** — the help text is a literal in bin/cli.js. No template, no docs generation. Tests assert specific lines (e.g., `--with-npmrc`). Edits to help text are blind to test expectations until tests run; small risk.
- **`runDoctor` exit-code-2 path** (no manifest) returns `{exitCode: 2, error: "...", target}` without the rest of the structured fields. The TUI presenter must handle this short-record shape.
- **`forceInstall` "type 'overwrite'"** confirmation in TTY (bin/cli.js:179) — replacing with `clack.confirm("Overwrite?")` changes the UX and is a deliberate spec call. Today's literal-match has a useful "you really meant it" property a boolean confirm loses.
- **Tests run as child processes for cli.test.mjs** — when the new TUI uses `@clack/prompts` in non-TTY children, clack must degrade silently. If it prints clack-specific framing to a non-TTY stdout, those bytes land in `result.stdout` and break assertions. Verify before spec lands.
- **PlantUML jar fetch progress** — fetch is ~19 MB. Today the CLI emits no progress (silent until done). A branded spinner during fetch is a TUI opportunity but adds a clack call inside the fetch promise — spec needs to decide whether `fetchPlantumlIfMissing` learns about presentation, or the caller wraps it.
