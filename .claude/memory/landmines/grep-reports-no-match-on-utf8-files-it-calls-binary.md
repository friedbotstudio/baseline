---
key: grep-reports-no-match-on-utf8-files-it-calls-binary
category: landmines
scope: []
governs: .claude/**, src/**, tests/**, docs/**
load_bearing: true
verified-at: 7d7039c
last-touched: 2026-08-26
---

- On macOS/BSD, `file` classifies a perfectly valid UTF-8 source containing an em dash as `binary data`, and plain `grep` then reports **no match** and exits 1 rather than warning. There is no error, no "Binary file matches" line, nothing. It looks exactly like a clean result.
- Reproduced 2026-08-04 against `.claude/skills/document/document-gate.mjs`: `grep -c "export function" <file>` exited 1 with no output while the file demonstrably contained two such lines. `grep -a -c` returned 2. `od -c` confirmed a normal 3-byte UTF-8 em dash (`E2 80 94`) in the header comment.
- Why this is dangerous here specifically: this repo puts em dashes in almost every SKILL.md, hook header and source comment as a matter of house voice. So the failure mode is not rare, and it silently answers "that symbol does not exist" during exactly the searches that matter, such as a dead-code scan during `/simplify`.
- **Always pass `-a` when grepping repo sources.** `grep -a -rn "<pattern>" <paths>`. Treat an empty grep result on a file you have not opened as unproven, not as absence.
- **Re-verified 2026-08-26 and the repro did NOT reproduce.** On the same file, `grep -c "export function"` returns 3 and exits 0, under both `en_US.UTF-8` and `LC_ALL=C`, and `file` now reports it as `Unicode text, UTF-8 text` rather than `binary data`. The file has been edited since, and the grep or `file` build may have changed too. What that establishes is that the cited evidence no longer stands, not that the failure mode is gone — I could not construct a current case either way. The `-a` habit costs nothing and is worth keeping; the 2026-08-04 measurement is what you should stop citing.
- Second-order trap from the same session: `grep ... | head` reports `head`'s exit code, not grep's. When the exit code is the signal, capture first (`OUT=$(cmd 2>&1); EC=$?`) and inspect `$EC`.

## 2026-08-05 — a second, worse cause: a real control byte

- A **raw NUL (0x00)** in a source file produces the same invisibility with a harder edge. Found in three files: `roll.mjs` (written that session) and, already committed and shipped, `memory-index/index-io.mjs` (`be48ab9`) and `document/document-gate.mjs` (`e7d95af`). All three used a NUL as a glob-expansion sentinel — a deliberate idiom, since NUL cannot occur in a path glob.
- **`git diff` emits `Binary files ... differ` and NO line content.** This is the consequence the em-dash case does not have, and it is the expensive one: `drift_check`'s AC scoring, `rightsize-gate`'s line measure, and above all **human review** all go blind at once. The two shipped modules were binary to `git diff` on the very commits that introduced them, so their review saw a blob where code should have been.
- Node parses a NUL inside a template literal without complaint, and the byte renders as nothing in an editor and in the Read tool. Tests pass. The audit passes. Nothing surfaces it.
- Now gated: `tests/control-bytes.test.mjs` scans every tracked text file for C0 controls other than tab/LF/CR, using an allowlist of text extensions (a blocklist fails open on the next vendored binary type) and excluding `docs/archive/**` because archived bundles are immutable.
- **This entry existed, was `load_bearing: true`, and governed `.claude/**` when the trap recurred.** The dead-code scan that missed `roll.mjs` on 2026-08-05 is precisely the scenario the bullet above warns about. Knowing the rule is not the same as applying it under momentum; the mechanical gate is what actually closes it.

## 2026-08-13 — third recurrence, and a cause the NUL-sentinel framing hides

- Recurred in `standup-recap-single-pass`, in `.claude/skills/standup/render.mjs` and `tests/standup-recap-single-pass.test.mjs`. `git diff --numstat` printed `-\t-\t.claude/skills/standup/render.mjs`, and `grep -n` on the two files returned nothing at all while the lines plainly existed.
- **The cause was not a sentinel.** Both prior cases used a NUL deliberately, as a glob-expansion marker. This one was a regex character class written with LITERAL control bytes — an editor-invisible class holding the raw bytes, where the printable six-character escape text (backslash-u-0-0-0-0 and its siblings) was intended. Three raw bytes at offsets 1596-1599. The regex was semantically CORRECT and every test passed; only the byte encoding was wrong. Framing this entry solely around "a NUL used as a sentinel" is what let the class of defect through a second time.
- **Write control characters as escape TEXT, never as the bytes themselves.** `\u0000` as six printable characters is what keeps the file diffable. This applies to regex classes, string constants and test fixtures alike.
- Confirms the closing claim above rather than weakening it: `tests/control-bytes.test.mjs` caught it within one suite run, named the file and the byte offset, and the whole thing cost minutes. The mechanical gate is still the thing that closes this, and it has now paid for itself twice.
- Related: a Bash tool call carrying literal control characters is refused before it runs, so an inline `node -e` probe cannot even be used to investigate. Write the probe to a file with `\u` escapes instead.

## 2026-08-13 — fourth recurrence: inside this entry, while documenting it

- Writing the section above put a **literal NUL into this file**, at byte 3738, in the very bullet that says to use escape text. `tests/control-bytes.test.mjs` failed on `.claude/memory/landmines/grep-reports-no-match-on-utf8-files-it-calls-binary.md` one command after it had passed on the source files.
- Then the repair attempt failed the same way twice more: a `node -e` fixer and an `Edit` call were both authored with the raw bytes typed into the character class. The Bash tool refused the first outright (`command contains control characters`), and the Edit simply did not match.
- **Memory files are covered by this trap too.** The scan is not limited to source; any tracked text file goes binary the same way, and a landmine that cannot be grepped is a landmine that will not be found by the next person looking for it.
- The reliable move, having now failed the direct one four times: never type the byte. Write the fix to a scratchpad `.mjs` file where the class is spelled with `\u` escapes, run that, and let the guard confirm. Typing the character into a tool call is the step that keeps failing, not the understanding.
- Frequency note for whoever reads this next: four occurrences across three sessions, every one of them caught by the mechanical gate and none by review. Weight the gate accordingly.
