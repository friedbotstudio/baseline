---
key: @clack/prompts@1.4.0
category: libraries
scope: [research]
verified-at: 8201af6
last-touched: 2026-08-14
---

- Role: terminal prompt primitives behind the branded TUI in `src/cli/tui/*`. The first and only runtime dependency declared in `package.json`. Imported via dynamic `await import('@clack/prompts')` from `bin/cli.js` so it loads only on the `process.stdout.isTTY === true` branch; non-TTY invocations never execute clack code.
- API surface used: `intro(msg)`, `outro(msg)`, `cancel(msg)`, `spinner()` returning `{start, message, stop, error, cancel}`, `select({message, options})`, `log.{info,warn,error,success,step}`, `isCancel(value)`. Verified via `context7 /bombshell-dev/clack` query during the branded-cli-tui workflow.
- Transitive closure (6 packages total): `@clack/core@1.3.1`, `fast-wrap-ansi@0.2.0`, `fast-string-width@3.0.2` (+ `fast-string-truncated-width@3.0.3`), `sisteransi@1.0.5`. `npm audit --omit=dev` clean at adoption time.
- Test seam: every `src/cli/tui/*` `run({...})` accepts an optional `prompts` parameter that defaults to the real `@clack/prompts` module; tests inject a stub object capturing intro / outro / spinner / select / isCancel calls without needing a pseudo-TTY. Cancel sentinel for `isCancel` is `Symbol.for('clack:cancel')`. See `tests/tui-install.test.mjs:23-49`.
- Caveat: empirical probe at branded-cli-tui `/tdd` Step 0 confirmed clack emits Unicode framing bytes (≈41 B for a minimal intro+log+outro) to **non-TTY stdout** — clack does NOT silently degrade. The architecture's TTY-vs-plain router (`bin/cli.js → dispatchInstall/dispatchUpgrade/dispatchDoctor`) routes around clack on the non-TTY path; never invoke clack inside a path that may run non-TTY without the explicit `process.stdout.isTTY` guard. The exact-version pin (`"1.4.0"`, no caret) is part of the supply-chain contract enforced by `scripts/check-files-diff.mjs → DEPS_ALLOWLIST`.
