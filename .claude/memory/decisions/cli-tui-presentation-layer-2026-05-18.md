---
key: cli-tui-presentation-layer-2026-05-18
category: decisions
scope: [spec]
source: archived bundle at `docs/archive/2026-05-18/branded-cli-tui/` (intake, scout, research, spec, security, spec.approved).
verified-at: 3c74ba8
last-touched: 2026-06-20
---

- Decision: branded TUI ships as a presentation layer under `src/cli/tui/*` (install / upgrade / doctor / tokens), composed from the existing pure-data functions (`freshInstall`, `forceInstall`, `threeWayMerge`, `runDoctor`). `bin/cli.js` routes between tui and plain via `process.stdout.isTTY` and **dynamic** `await import('../src/cli/tui/*.js')` so `@clack/prompts` never loads on non-TTY paths.
- Rationale: empirical probe at `/tdd` Step 0 confirmed clack emits ≈41 B of Unicode framing to non-TTY stdout (it does NOT silently degrade). Loading clack on the plain path would contaminate CI / piped output and break the byte-clean regression of `tests/cli-tui.test.mjs → test_when_install_in_non_tty_then_emits_plain_output_byte_identical_to_today`. The dynamic-import seam keeps the plain path zero-byte-clack and preserves the structured/presentation split that already existed for `runDoctor` (data) and `formatReport` (text).
- Rejected alternatives:
  - Wrap `src/cli/io.js` to delegate to clack when TTY → smallest diff but largest blast radius: every `io.log` call (including non-flow status lines like "Installed manifest version 1 to …") would route through clack's visual rhythm. Bleeds clack into surfaces where plain output is deliberate.
  - Presenter interface with TTY/Plain implementations (Candidate C in `docs/archive/2026-05-18/branded-cli-tui/research.md`) → premature for three flows of ~30 LOC each; the interface drift cost outweighs the duplication cost at this scale. Reconsider if a 4th branded flow (e.g., `init-project` redesign) lands in one release cycle.
  - Eager `import '@clack/prompts'` at `bin/cli.js` top → also retired by empirical probe; would force clack to load even in pure-non-TTY invocations and was the original draft before the probe.
- Trade-offs accepted: `--merge` flag is hard-removed (not deprecation-aliased) — pre-1.0 conventions allow the break; `tests/cli.test.mjs → '--dry-run on conflict' was deleted` since it exercised the removed flag. `scripts/check-files-diff.mjs` relaxes the "dependencies must be empty" rule via an explicit `DEPS_ALLOWLIST = {'@clack/prompts'}`; future additions to that set require a spec amendment.
