---
key: a-raw-control-byte-separator-makes-a-source-file-binary-to-git
category: landmines
scope: []
governs: tests/epic-heading-grammar.test.mjs
load_bearing: true
source: incident
verified-at: 309d70e
last-touched: 2026-08-17
---

> control bytes make a file binary to git diff, blinding review and every diff-reading check

- **The trap has two halves, and fixing one half breaks the other.** `tests/epic-heading-grammar.test.mjs` keys `DECLARED_DELTAS` on a composite `${site}<SEP>${line}`. The separator was written as a **raw** U+0000 byte in 13 places (the set literals, the key construction at the `observed` Set, two `split()` calls, two assertions, and the comment describing them). That made the whole file binary to `git diff` and tripped `tests/control-bytes.test.mjs`.
- **Do not delete the separator.** It is load-bearing: it is what keeps a site name and a heading line from colliding in one key. Deleting it silently merges distinct keys. The repair is to write the same character as a **JS escape sequence** — byte-identical at runtime, no raw control byte in the file.
- **Why the gate exists at all** (`tests/control-bytes.test.mjs:1-13`): a source file containing a NUL is classified binary, so `git diff` emits "Binary files … differ" instead of line content. Every diff-reading consumer goes blind at once — `drift_check`'s AC scoring, `rightsize-gate`'s line measure, and human review, which sees an opaque blob where a module should be. `grep`'s behaviour on such files is platform-dependent, so tooling that greps becomes unreliable rather than failing.
- **The detector reports only the FIRST control byte per file.** `firstControlByte` returns on its first hit, so a single reported offset can hide a dozen more. Count them all before concluding the repair is complete — this file reported one offset and carried thirteen bytes.
- **It shipped and stayed red for two commits.** Landed at `309d70e`; the suite was red at HEAD when the next workflow ran `/verify`, which is how it was found. A `git ls-files`-driven gate cannot fire until the file is tracked, so the write and the detection are one commit apart at minimum.
- Related: [[grep-reports-no-match-on-utf8-files-it-calls-binary]] — the same binary-classification failure, reached from the grep side.
