# Security reports — cli-wordmark-on-all-commands

## cli-wordmark-on-all-commands-2026-05-23.md

# Security Review — cli-wordmark-on-all-commands — 2026-05-23

## Summary

**Risk: LOW.** Pure TUI display change. New `renderHeader` function composes existing helpers; install/upgrade/doctor TUI swap their slim brand-strip call for `renderHeader`. All inputs are first-party literal strings or values read from `package.json`. No new dependencies, no file/network I/O, no crypto, no regex against untrusted input. No findings to enumerate.

Reviewed: `src/cli/tui/{splash,install,upgrade,doctor}.js` plus 3 test files. Total diff ≈ 105 lines.

## Findings

None.

## What I checked (positive notes)

- **`src/cli/tui/splash.js` — new `renderHeader({subtitle?, version?, columns?})`**: composes `muted()`, `renderWordmark()`, `renderBrandStrip()`, `wordmarkFits()`. All callers pass literal-string subtitles (`'install'`, `'upgrade'`, `'doctor'`) and `version` from `package.json` read by `readPackageVersion()`. No path from user input to ANSI escape construction; no terminal-injection vector.
- **`src/cli/tui/install.js:24` and `src/cli/tui/upgrade.js:52`**: one-word swap from `renderBrandStrip` to `renderHeader`. Inputs and call shape identical to the prior callsite; no new trust boundary.
- **`src/cli/tui/doctor.js:8-26`**: `brandHeader()` local helper renamed to `targetAndManifestLines()` and `renderHeader({subtitle:'doctor'})` prepended at the top of `render()`. The `target` field passed into `targetAndManifestLines` comes from `runDoctor()`'s `target` argument (first-party CLI argv); no change to data flow.
- **`tests/*` — new captureStdout helper**: monkey-patches `process.stdout.write` with try/finally restore. Standard test idiom; no production impact.
- **Dependencies**: no `package.json` or `package-lock.json` changes. `@clack/prompts@1.4.0` remains the sole runtime dep.
- **Secrets scan**: no hardcoded tokens, keys, env material, or PII in the diff.
- **Terminal-injection risk**: ANSI escape sequences in `renderHeader` output come from the static `PALETTE` constants and `WORDMARK` literal (defined in splash.js). No path from user input into the escape stream — the only user-influenced values (subtitle, version) are wrapped in `muted()` which does not inspect content beyond color codes.

## Out of scope / Noted

- **Width-gate fallback path**: when `wordmarkFits(columns)` returns false, `renderHeader` delegates to `renderBrandStrip`. The fallback inherits whatever security posture `renderBrandStrip` already had (which was reviewed in prior workflows as LOW). No new behavior on the fallback path.
- **`process.stdout.columns` reliance**: the width gate reads `process.stdout.columns` when no explicit `columns` arg is passed. This is Node-provided trusted input; `wordmarkFits` already handles the falsy/0 case from script(1) ptys per the existing comment at splash.js:55. No new edge case introduced.

