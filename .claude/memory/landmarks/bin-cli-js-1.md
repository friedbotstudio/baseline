---
key: bin/cli.js:1
category: landmarks
scope: [scout]
---

- Role: `create-baseline` CLI entrypoint — argv routing, mode dispatch (fresh / `--force` / `upgrade` subcommand / `doctor` subcommand / `--dry-run`), exit codes 0/1/2/3/4.
- TTY routing: `dispatchInstall`, `dispatchUpgrade`, `dispatchDoctor` each branch on `process.stdout.isTTY` and dynamic-import the matching `src/cli/tui/*.js` module on the TTY path; non-TTY falls through to the plain path so clack never loads in CI. The `--help` and `--version` branches do the same against `src/cli/tui/meta.js` (TTY → brand banner, non-TTY → bare body).
- `--merge` flag removed in branded-cli-tui; passing it now exits 2 with stderr line pointing to `create-baseline upgrade <target>`. The router catches `parseArgs`'s unknown-option throw and emits the migration message before exit.
- Doctor adds `--json` flag: emits `JSON.stringify(report)` on stdout with the same exit codes; `--strict` still escalates customizations to exit 1. Error reports (no-manifest) also route through the TUI renderer when `process.stdout.isTTY` — no more short-circuit to the plain text formatter.
- Verified-at: 8e6f904
- Last-touched: 2026-06-23
- Caveat: depends on every src/cli/*.js module + needs `obj/template/` to exist (run `npm pack` or `bash scripts/build-template.sh` first). Tests can override the template dir via `CREATE_BASELINE_TEMPLATE_DIR=<path>` env var without running the full build (read at `bin/cli.js:73`).
