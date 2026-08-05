---
key: grep-reports-no-match-on-utf8-files-it-calls-binary
category: landmines
scope: any
governs: .claude/**,src/**,tests/**,docs/**
load_bearing: true
verified-at: 35212e8
last-touched: 2026-08-05
---

- On macOS/BSD, `file` classifies a perfectly valid UTF-8 source containing an em dash as `binary data`, and plain `grep` then reports **no match** and exits 1 rather than warning. There is no error, no "Binary file matches" line, nothing. It looks exactly like a clean result.
- Reproduced 2026-08-04 against `.claude/skills/document/document-gate.mjs`: `grep -c "export function" <file>` exited 1 with no output while the file demonstrably contained two such lines. `grep -a -c` returned 2. `od -c` confirmed a normal 3-byte UTF-8 em dash (`E2 80 94`) in the header comment.
- Why this is dangerous here specifically: this repo puts em dashes in almost every SKILL.md, hook header and source comment as a matter of house voice. So the failure mode is not rare, and it silently answers "that symbol does not exist" during exactly the searches that matter, such as a dead-code scan during `/simplify`.
- **Always pass `-a` when grepping repo sources.** `grep -a -rn "<pattern>" <paths>`. Treat an empty grep result on a file you have not opened as unproven, not as absence.
- Second-order trap from the same session: `grep ... | head` reports `head`'s exit code, not grep's. When the exit code is the signal, capture first (`OUT=$(cmd 2>&1); EC=$?`) and inspect `$EC`.

## 2026-08-05 — a second, worse cause: a real control byte

- A **raw NUL (0x00)** in a source file produces the same invisibility with a harder edge. Found in three files: `roll.mjs` (written that session) and, already committed and shipped, `memory-index/index-io.mjs` (`be48ab9`) and `document/document-gate.mjs` (`e7d95af`). All three used a NUL as a glob-expansion sentinel — a deliberate idiom, since NUL cannot occur in a path glob.
- **`git diff` emits `Binary files ... differ` and NO line content.** This is the consequence the em-dash case does not have, and it is the expensive one: `drift_check`'s AC scoring, `rightsize-gate`'s line measure, and above all **human review** all go blind at once. The two shipped modules were binary to `git diff` on the very commits that introduced them, so their review saw a blob where code should have been.
- Node parses a NUL inside a template literal without complaint, and the byte renders as nothing in an editor and in the Read tool. Tests pass. The audit passes. Nothing surfaces it.
- Now gated: `tests/control-bytes.test.mjs` scans every tracked text file for C0 controls other than tab/LF/CR, using an allowlist of text extensions (a blocklist fails open on the next vendored binary type) and excluding `docs/archive/**` because archived bundles are immutable.
- **This entry existed, was `load_bearing: true`, and governed `.claude/**` when the trap recurred.** The dead-code scan that missed `roll.mjs` on 2026-08-05 is precisely the scenario the bullet above warns about. Knowing the rule is not the same as applying it under momentum; the mechanical gate is what actually closes it.
