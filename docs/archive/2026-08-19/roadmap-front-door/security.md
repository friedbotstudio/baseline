# Security reports — roadmap-front-door

## roadmap-front-door-2026-08-19.md

# Security Review — roadmap-front-door — 2026-08-19

## Summary

Overall risk: **LOW**. The change adds a read-only CLI verb and hoists an existing
terminal sanitizer into one shared module. It adds no dependency, no network call,
no credential path, and no write path — every new code path reads repository files
and prints to a terminal. The one finding is a consistency gap in that print path
whose only reachable input already implies a stronger compromise.

## What was checked

- The full branch diff (15 files, 70 insertions, 66 deletions) against `HEAD`.
- Every string reaching stdout from `.claude/skills/roadmap/render.mjs`, traced back
  to its parser in `.claude/skills/roadmap/parse.mjs`.
- The two sanitizer call sites repointed at the hoisted module, compared byte-for-byte
  against the copies they replaced.
- CLI flag handling on the new `list` verb (`--epic`, `--root`, `--all`, `--json`).
- Regex complexity on every pattern the diff introduces.
- `npm audit --omit=dev` and the diff of `package.json`.

## Findings

### [LOW] The plan path in the `list` header is printed without sanitizing

- **OWASP**: A03 - Injection | **CWE**: CWE-150 (improper neutralization of escape sequences)
- **File**: `.claude/skills/roadmap/render.mjs:118`
- **Evidence**:
  ```js
  const out = [
    `Roadmap — ${view.path}`,
    `${view.epicCount} epics · ${rows} rows · ${done} done, ...`,
  ```
- **Impact**: `view.path` originates in `.claude/project.json → roadmap.path`. A C0
  control sequence there reaches the operator's terminal unneutralised and can erase
  the line above it, which is the exact forging technique the sanitizer exists to stop.
  The impact is bounded to that: the same file declares `test.cmd`, which the harness
  executes, so an attacker who can write it already has command execution and gains
  nothing from a cursor trick.
- **Recommendation**: wrap it — `Roadmap — ${clip(view.path)}` — so one rule covers
  every repository-controlled string on the page. Treat this as consistency work, not
  as remediation of a reachable threat.

## What is not a finding

- **Row ids are safe by construction.** `TASK_ROW_RE` in `parse.mjs:43` constrains an
  id to `[A-Za-z0-9][A-Za-z0-9-]*`, so the unclipped `task.id` and `pickup.id` in the
  render output cannot carry a control byte. `standup/render.mjs:167` prints the id
  unclipped for the same reason.
- **Epic and row titles are clipped.** Every title, the one genuinely unconstrained
  field the parser emits, passes through `clip` before it is printed.
- **The hoist changes no behavior.** `terminal-text.mjs` carries the same transform
  the two removed copies did, in the same order — controls replaced with a space
  before whitespace collapses. The order is asserted directly in
  `tests/terminal-text.test.mjs`, and both consumers' existing suites pass unchanged.
- **No regex in the diff backtracks.** The character class is a literal class; `/\s+/g`
  and `compressRuns` are linear in input length.
- **`--root` is not a trust boundary.** It names a directory the invoking user already
  chose from their own shell.

## Dependencies

No package was added, removed, or upgraded. `npm audit --omit=dev` reports 0
vulnerabilities. `terminal-text.mjs` imports nothing.

## Out of scope / Noted

The test source for the sanitizer originally embedded literal ESC and BEL bytes, which
made git classify the file as binary and hid it from the drift diff. It would also have
tripped the repository's own `tracked text files carry no stray control bytes` check on
the first commit. The source now spells those bytes as escapes. Worth knowing for any
future test that needs to exercise control characters.

