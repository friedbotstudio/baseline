# Pattern Research — branded-cli-tui

The library choice is decided at triage: `@clack/prompts`. This memo lays out **how to integrate clack into the existing CLI shape**. Three integration patterns; one recommendation; one set of flippers.

## Library reference

- `@clack/prompts` — Clack monorepo (`/bombshell-dev/clack`, branch `v0`, current per context7).
  - Primitives surfaced: `intro`, `outro`, `cancel`, `confirm`, `select`, `multiselect`, `text`, `password`, `group`, `spinner`, `tasks`, `note`, `log.{info,success,step,warn,error,message}`, `stream.{info,...}`, `isCancel`.
  - `spinner()` returns an object with `.start(msg)`, `.message(msg)`, `.stop(msg)`, `.error(msg)`, `.cancel(msg)`.
  - `group({...}, {onCancel})` is the canonical shape for sequential prompts with shared cancellation handling.
  - `@clack/core` is the low-level primitive layer for custom prompts (`TextPrompt`, `SelectPrompt`, etc.).
  - **Non-TTY behavior** — context7 does not surface explicit non-TTY/CI semantics. Landmine flagged in scout; needs empirical verification before spec lands.
  - **Theming** — colors are composed inline (`color.cyan('~')` in the docs example, picocolors under the hood). No explicit theme-object API in the docs; brand-color application is per-call, not global.
  - **Version pin** — to set at spec time against `npm view @clack/prompts version` (context7 doesn't pin a specific semver; the `v0` branch implies pre-1.0 surface, so explicit pinning matters).
  - Source: context7 `/bombshell-dev/clack` query, pages on intro/outro, group, isCancel, spinner, log, stream.

---

## Candidate A: Wrap `io.js` to delegate to clack when TTY

- **Summary**: Replace the internals of `io.log` / `io.warn` / `io.error` with TTY-aware dispatch — call `clack.log.info` / `clack.log.warn` / `clack.log.error` when `process.stdout.isTTY`, fall through to today's `process.stdout.write` otherwise. Add new `io.section`, `io.step`, `io.spinner`, `io.confirm`, `io.select` helpers. Every existing caller in `bin/cli.js` keeps its call sites; the install/upgrade/doctor flows pick up new helpers as they need them.
- **API references (current)**:
  - `@clack/prompts log.info` / `log.warn` / `log.error` — see context7 `Logging Messages with Styles`.
  - `@clack/prompts spinner()` — see context7 `Spinner for Long-Running Operations`.
- **Fits**: Partially. Scout observes `io` is the single output seam — wrapping it preserves that property. But the existing seam carries plain log lines (install summary, "Pin via …", error toasts) that don't always belong inside a clack visual frame; routing them through `clack.log.info` adds bullets, symbols, and vertical rhythm to surfaces that today are flat lines (e.g., the post-install "Installed manifest version 1 to …" line at bin/cli.js:243).
- **Tests it enables**: child-process CLI tests (`tests/cli.test.mjs`) keep working **only if** clack's non-TTY behavior is silent. If clack emits framing bytes to non-TTY stdout, assertions in `tests/cli.test.mjs` (e.g., expected substring match on `--help` output, conflict detection messages) will need to be relaxed or the io wrapper must check `process.stdout.isTTY` itself and skip clack entirely off-TTY.
- **Tradeoffs**: Smallest diff in `bin/cli.js`, biggest behavioral surface area expanded — every existing `io.log` call now passes through a TTY-detection branch. The "io is the seam" property is preserved but the seam grows wider. Risk: clack's visual rhythm bleeds into surfaces where plain output was deliberate.

## Candidate B: Per-flow `tui` modules; leave `io` for primitives

- **Summary**: Add three flow modules under `src/cli/tui/` — `install.js`, `upgrade.js`, `doctor.js`. Each owns its branded flow (intro → steps → outro), pulls clack primitives directly, and renders the existing structured outputs (`{actions, exitCode}` from `threeWayMerge`, the doctor `{matched, customized, ...}` report). `bin/cli.js` picks tui vs plain based on `process.stdout.isTTY`:

  ```js
  if (process.stdout.isTTY) {
    return tui.install.run({ target, opts });
  } else {
    return plain.install.run({ target, opts }); // today's path
  }
  ```

  `io.js` keeps its current primitives (`log`, `warn`, `error`, `ask`) for the plain path. Clack stays scoped to `src/cli/tui/*`.
- **API references (current)**:
  - `intro` / `outro` / `cancel` — context7 `Intro and Outro for Prompts`.
  - `spinner` / `tasks` — context7 `Spinner for Long-Running Operations`, `Executing Tasks with Spinners`.
  - `confirm` / `select` / `multiselect` — context7 `Build a Full CLI Application with Clack`.
  - `isCancel` / `cancel` — context7 `Handle Prompt Cancellation`.
- **Fits**: Strong. Scout observes the install/merge/doctor surfaces already have a clean structured/presentation split — `runDoctor` returns data, `formatReport` formats it. Candidate B mirrors that pattern: `runDoctor`/`freshInstall`/`threeWayMerge` continue to return data, and the tui modules are presentation only. Today's `formatReport` becomes one of two presenters.
- **Tests it enables**:
  - `tests/cli.test.mjs` child-process invocations land non-TTY, hit the plain path, keep their existing assertions unchanged.
  - New TUI-specific tests live alongside `src/cli/tui/*` and exercise the flow modules with a fake `stdout`/`stdin` pair (clack accepts custom streams) — without coupling to the rest of the CLI.
  - Unit tests for the existing `runDoctor`/`threeWayMerge` stay unchanged (their return shape is unchanged).
- **Tradeoffs**: Three new files. Some duplication ("install started" message exists in both plain and tui paths). The duplication is small (1–3 lines per surface) and is the price for keeping clack out of the plain path. Risk: drift between the two presenters' content as they evolve — mitigated by a shared "what does this surface communicate?" record (likely a thin `messages.js` per flow, holding strings both presenters read).

## Candidate C: Presenter interface with TTY/Plain implementations

- **Summary**: Define a `Presenter` interface (`intro`, `step`, `progress`, `confirm`, `select`, `note`, `outro`, `error`). Two implementations: `TuiPresenter` (delegates to clack) and `PlainPresenter` (delegates to today's `io`). Each flow takes a `presenter` parameter and calls into it. `bin/cli.js` picks at the top level:

  ```js
  const presenter = process.stdout.isTTY ? new TuiPresenter() : new PlainPresenter();
  return install.run({ target, opts, presenter });
  ```

  Tests pass `PlainPresenter` (or a `RecordingPresenter` for assertions) directly.
- **API references (current)**: same as Candidate B (clack primitives) plus the discipline of one interface per flow.
- **Fits**: Adheres rigorously to Article VI.6's Orchestration/Domain/Foundation layering (presenter is Foundation; flows are Orchestration). Most testable — flows are decoupled from clack and from `io`. Symmetry between TTY and plain is enforced by the interface contract.
- **Tests it enables**: Above-and-beyond — `RecordingPresenter` makes flow-level integration tests cheap (assert "intro called with X, then 4 steps, then outro Y"). No subprocess needed.
- **Tradeoffs**: Most abstraction. Article VI.4 ("abstract at the third concrete use case") is satisfied — we have exactly three flows (install, upgrade, doctor). But every flow now traverses a virtual call (presenter.X) on every output line, and the interface is one more thing to keep in sync. If `@clack/prompts` non-TTY degradation turns out to be silent and clean, the TUI presenter does essentially nothing extra in non-TTY contexts — the Plain presenter becomes redundant and the abstraction is overhead.

---

## Recommendation

**Candidate B (per-flow tui modules).** It matches the structured/presentation split scout identified, keeps clack out of the surfaces where plain output is deliberate, and the duplication cost is small (3–9 lines of message strings, mitigable with a per-flow `messages.js` shared by both presenters). The plain path stays byte-identical to today, which is the cheapest way to preserve `tests/cli.test.mjs` + the non-TTY contract.

The architectural win Candidate C offers — testable flows decoupled from clack — is real but small-scale: three flows, each ≤ ~30 lines of presentation, with their data sources already pure functions. The "interface drift" cost of C outweighs the "duplication" cost of B at this scale.

### What would flip the decision

- **If `@clack/prompts` non-TTY behavior is non-silent** (emits framing characters to a piped stdout), all three candidates need an explicit TTY branch, and the marginal cost of C drops to near zero. B and C converge; pick C for the testability.
- **If a 4th branded flow lands within one release cycle** (e.g., `init-project` redesign per the existing CLAUDE.md amendment paragraph), the third-use abstraction threshold is met for the presenter interface and C becomes the natural shape.
- **If the brand requires animations or layouts beyond clack's primitives** (e.g., side-by-side diff view in the upgrade conflict resolver), we'll need `@clack/core` custom prompts — at which point a presenter interface lets us add a `DiffPresenter` capability without bleeding the implementation across every flow.

---

## Open questions

1. **`@clack/prompts` version pin.** Latest npm semver to record. Context7 covers branch `v0` (pre-1.0); behavior may change in 0.x. Spec must pin an exact version (e.g., `0.X.Y`) and document the upgrade-cadence policy.
2. **Non-TTY emit behavior.** Does `clack.log.info` / `intro` / `spinner` emit anything to a piped stdout? If yes, the integration must branch on `process.stdout.isTTY` before calling clack at all (regardless of candidate). Verify empirically at spec time with a 3-line probe.
3. **TTY stream rule.** Scout flagged the asymmetry: today's `io.isTTY` reads `process.stdin.isTTY`; clack keys off `process.stdout.isTTY`. Spec must pick one consistent rule and apply it across `--force` / `--merge` / TUI branches. Probable answer: `process.stdout.isTTY` (matches clack and most CLI conventions), with a deliberate test that the existing `tests/cli.test.mjs:96` ("`--force` in non-TTY context exits 2") remains green.
4. **`--merge` back-compat.** Carried from intake. The chosen path (hard-remove / deprecation warning + alias / hidden alias) affects help text, exit-code semantics (current `--merge` returns exit 3 on skipped customizations — does `upgrade` inherit?), and semver (`.releaserc.json` rules → major vs. minor).
5. **Upgrade flag set.** Carried from intake. Which install flags carry over to `upgrade`? Likely yes for `--dry-run` (preview) and `--no-plantuml` (skip jar fetch on upgrade), likely no for `--with-npmrc` (npmrc is install-only).
6. **Brand color application.** Clack composes colors inline (no theme-object). Likely we ship a small `src/cli/tui/tokens.js` exporting branded color functions (`brand.accent('text')`, `brand.muted('text')`) backed by picocolors or `node:util styleText`. The oklch → terminal color translation table sits here; spec decides oklch → 24-bit RGB or oklch → nearest-256.
7. **Spinner during PlantUML fetch.** ~19 MB download, currently silent. Adding a clack spinner means the fetch function needs a progress callback (or the caller wraps the call with `tasks([...])`). Spec to pick.
8. **Custom prompts for the upgrade conflict diff view.** If the user picks "show diff" in upgrade, we need a multi-screen view: header, diff body, footer with choices. `@clack/prompts note` renders a static block; for an interactive diff-pager we'd need `@clack/core` custom prompts. Spec to scope.
9. **Doctor `--json` mode.** Carried from intake. Today `runDoctor` returns a structured object internally but `bin/cli.js` only prints `formatReport(report)`. Adding `--json` is a tiny PR (emit `JSON.stringify(report)`) — should it ride along, or be a separate intake?
10. **What about `--help` for subcommands?** Scout flagged help-text growth. Today there's one HELP_TEXT. Should `create-baseline upgrade --help` show a subcommand-scoped help? Affects `parseArgs` shape (subcommand → flag set) and changes the help-text architecture. Spec to scope or defer.
