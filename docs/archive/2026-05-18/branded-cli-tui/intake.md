# Introduce a branded TUI for the create-baseline CLI install / upgrade / doctor flows

<!--
Intake document. Produced by the `intake` skill.
Required sections (enforced by artifact_template_guard): Problem, Goal, Acceptance criteria.
-->

## Problem

`@friedbotstudio/create-baseline` is today a flag-driven scaffolder with plain text output. The first impression a developer gets — `npx @friedbotstudio/create-baseline <target>` — is a sequence of unformatted console lines naming sentinel paths and exit codes. There is no branded surface, no visual rhythm, and no interactive layer where it would actually pay off (upgrade conflict resolution). The CLI is the *only* product touchpoint outside the docs site, and it currently does not carry the studio's identity.

Three concrete pain surfaces:

1. **Install reads as a script, not a product.** Output is correct but unbranded. A first-run user sees nothing that signals "this is a Friedbot Studio product."
2. **Upgrade is non-interactive and surfaces conflicts via exit code 3.** The existing `--merge` flag does a three-way merge, prunes baseline-removed files the user hadn't touched, and preserves customized-stale files — but offers the user no per-file choice. The user has to read the printed report and fix the tree by hand.
3. **`doctor` output is a flat list.** matched / customized / missing / added are printed as plain text. The signal a user needs ("is my baseline drifting?") is hidden in scrollback.

## Goal

`create-baseline`'s install, upgrade, and drift-check flows feel like a single coherent product surface in the terminal — branded, legible, and interactive where interactivity earns its keep — while preserving every existing flag-driven behavior for CI and scripted use.

## Non-goals

- Not rewriting the install / merge / doctor logic. The TUI sits on top of existing code paths in `src/cli/*`.
- Not adding telemetry or phone-home behavior.
- Not authoring a TUI library from scratch — `@clack/prompts` is the chosen prompt primitive.
- Not introducing a `--no-tty` global flag. CI/non-TTY detection happens via `process.stdout.isTTY`; the TUI degrades to plain output automatically.
- Not changing the `audit-baseline` skill's drift logic. Only `doctor`'s presentation layer changes.
- Not touching `init-project` (the configure-after-install command) in this scope. Its TUI is a separate intake if pursued.
- Not changing the `.baseline-manifest.json` schema or the three-way-merge algorithm. Only the surface that consumes them.

## Success metrics

- **Zero test regressions.** `bash .claude/skills/audit-baseline/audit.sh` exits 0, and `node --test tests/*.test.mjs` is fully green.
- **Runtime dependency footprint** — baseline: 0 runtime deps, target: exactly 1 (`@clack/prompts`) — measured via `npm ls --omit=dev --prod`.
- **CLI flag back-compat** — every existing flag (`--force`, `--dry-run`, `--no-plantuml`, `--require-plantuml`, `--with-npmrc`, `--strict` on doctor) continues to function identically. Measured via existing CLI tests + one new "non-TTY plain output mode" test per flag path.
- **Subjective product feel** — Tushar (project owner) reviews the install + upgrade + doctor flows in a fresh terminal session and accepts the visual register as production-ready Friedbot Studio brand. Captured as the spec-time `design-ui` final acceptance.

## Stakeholders

- **Requester**: Tushar Srivastava (project owner — razieldecarte@gmail.com).
- **Reviewer**: Tushar Srivastava (same — solo project at this stage; `design-ui`'s impeccable audit substitutes for a second reviewer on the visual register).
- **Operator**: every developer running `npx @friedbotstudio/create-baseline <target>` or, post-ship, `npx @friedbotstudio/create-baseline upgrade [target]`.

## Constraints

- **Node ≥ 18.17.0** (per `package.json` engines). No transpilation.
- **Pure ESM**, no `require()`. Matches the existing CLI shape.
- **`@clack/prompts` is the only sanctioned new dependency.** Its transitive closure (~5 packages) is the supply-chain delta to review at Phase 8. Any further deps require a spec amendment.
- **CI / non-TTY must work.** When `process.stdout.isTTY` is false, the CLI degrades to today's plain output. Never block waiting for input.
- **Existing flags are sticky.** Any flag deprecation (e.g., `--merge` → `upgrade`) is a deliberate spec-time decision, not a side effect.
- **Article X.2 routing.** Every visual design decision routes through `design-ui` (which invokes `impeccable`). Friedbot Studio house style is the brand register — same color/typography vocabulary as the docs site.
- **Article XI manifest discipline.** Adding `src/cli/tui/*` files updates `obj/template/manifest.json` via `scripts/build-template.sh`; the build script must continue to emit a passing manifest.
- **Article VI.5 context7 invocation.** Before writing `@clack/prompts` integration code, `context7` is queried for the current API surface. This binds during `/tdd` Step 2 (scenario authoring) and Step 3 (implementation).

## Acceptance criteria

1. Given a fresh target directory and a TTY, when the user runs `npx @friedbotstudio/create-baseline <target>`, then the CLI emits a branded install sequence (intro banner, per-phase spinners or progress indicators, outro summary) using Friedbot Studio color/typography tokens, and produces the same on-disk result as today's install.
2. Given a non-TTY invocation (stdout piped, CI), when the user runs the same command, then the CLI emits plain text equivalent to today's output and exits with the same code.
3. Given an existing target with `.claude/.baseline-manifest.json`, when the user runs `npx @friedbotstudio/create-baseline upgrade [target]` in a TTY, then the CLI presents each customized-stale file as an interactive choice (keep-mine / take-theirs / show-diff / abort), applies the user's choices, and writes a final summary.
4. Given the same scenario in a non-TTY, when the user runs `upgrade`, then the CLI defaults to today's `--merge` behavior (prune untouched-removed, preserve customized-stale, exit 3 if any conflicts remain).
5. Given an existing target, when the user runs `npx @friedbotstudio/create-baseline doctor [target]` in a TTY, then the CLI emits a colorized, sectioned report (matched / customized / missing / added) and preserves the existing exit codes (0 / 1 / 2, plus `--strict` semantics).
6. Given `doctor` invoked with `--json` (or equivalent machine-readable flag), the CLI emits structured output suitable for CI parsing. (Whether this flag is new or pre-existing is a spec-time decision — see Open questions.)
7. After install, `npm ls --omit=dev --prod` lists exactly one runtime dependency: `@clack/prompts` (with its transitive closure).
8. `package.json` `description` field no longer contains the string "Zero-dependency". README's positioning paragraph reflects the new posture and the `upgrade` subcommand.
9. Every pre-existing CLI flag (`--force`, `--dry-run`, `--no-plantuml`, `--require-plantuml`, `--with-npmrc`, `--strict`) continues to function identically. Verified by tests under `tests/*.test.mjs`.
10. `--merge` resolves to one of {hard-removed, deprecation warning + alias to `upgrade`, hidden alias}. The chosen path is set at spec time and verified by a corresponding test.
11. `bash .claude/skills/audit-baseline/audit.sh` exits 0 against the post-implementation tree.
12. The visual register is signed off by `design-ui`'s impeccable audit (no P0 issues, ≤ 1 P1 issue at handoff).

## Open questions

- **`--merge` back-compat.** Hard-remove (clean break, new major), deprecation warning + alias to `upgrade` (one-release transition), or hidden alias (`--merge` silently routes to `upgrade` forever)? Affects semver (major vs. minor bump via `.releaserc.json` rules). Decision deferred to spec.
- **Does `upgrade` accept the install flags?** `--force`, `--dry-run`, `--no-plantuml`, `--require-plantuml`, `--with-npmrc` — are these all meaningful on upgrade? Likely yes for `--dry-run` and `--no-plantuml`, no for `--with-npmrc` (the `.npmrc` is install-only). Spec to enumerate.
- **`doctor --json` flag.** Today `doctor` has no JSON output mode. Does the TUI redesign opportunity require adding one for CI consumers? Or is exit-code-only parsing sufficient (today's contract)?
- **Brand token surface.** Does Friedbot Studio house style mean reusing `site-src/_data/site.json` tokens directly, copying them into `src/cli/tui/tokens.js`, or sharing via a built artifact? Decision is structural and binds the spec's component graph.
- **Spinner library or hand-rolled?** `@clack/prompts` ships `spinner()`. Is that the chosen progress primitive, or do we want a custom branded spinner (frames, colors)? Routes through `design-ui` at spec time.
- **Upgrade idempotency.** If the user aborts mid-upgrade, what state does the tree land in? Today's `--merge` is atomic-per-file; the TUI must preserve that or document the new contract.
- **Telemetry of "PlantUML fetch failed."** The current flow prints a warning and proceeds (unless `--require-plantuml`). Does the branded surface change the failure communication, or stay identical?
