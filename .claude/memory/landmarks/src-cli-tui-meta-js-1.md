---
key: src/cli/tui/meta.js:1
category: landmarks
scope: [scout]
verified-at: 8e6f904
last-touched: 2026-06-23
---

- Role: Domain — branded renderers for the meta commands (`--help`, `--version`) AND for usage-class errors. Three exports: `renderHelp(helpText, _version)`, `renderVersion(version)`, `renderUsageError(msg, helpText, version)`. `renderHelp` in TTY prepends the full splash marquee from `src/cli/tui/splash.js:1` (wordmark + tagline + commands + try line + discover URL) before the canonical HELP_TEXT body; non-TTY emits HELP_TEXT byte-clean. `renderVersion` in TTY prints the wordmark + version marquee; non-TTY emits the bare version string. `renderUsageError` writes to stderr (banner + `Error: <msg>` + HELP_TEXT) so every parseArgs/usage-class exit ships brand-framed guidance.
- Companion: `src/cli/tui/splash.js:1` (wordmark + brand strip + marquee renderers), `src/cli/tui/tokens.js:1` (colors), `bin/cli.js` (every non-success return path routes through `usageError(msg)` which delegates here).
- Caveat: the non-TTY branch emits a BARE version (no `baseline v` prefix) on purpose — script consumers running `$(create-baseline --version)` expect a parseable version string. `renderHelp` deliberately ignores its `version` parameter (renamed `_version`) because the splash no longer renders a version line; version lives on `--version` only. Restoring version to the splash would force the docs-site cli-splash.png to re-render every release.
