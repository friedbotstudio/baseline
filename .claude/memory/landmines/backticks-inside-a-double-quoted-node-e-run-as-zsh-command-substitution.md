---
key: backticks-inside-a-double-quoted-node-e-run-as-zsh-command-substitution
category: landmines
scope: [tdd, chore, implement, simplify, integrate]
verified-at: 290a41b
last-touched: 2026-08-25
---

- **The trap.** `node -e "…"` under this repo's default shell (zsh) still performs command substitution inside the double quotes. A backtick in the JavaScript — common when the snippet builds a template literal or prints a markdown code fence — is read by the shell, not by node. The shell runs whatever sits between the backticks and splices its stdout into the program before node ever sees it.
- **Why it is easy to miss.** The failure does not look like a quoting bug. The snippet either runs a stray command, often silently, producing empty output that reads as "no matches", or it dies with a syntax error pointing at a line the source does not contain.
- **What to do instead.** Use single quotes around the `-e` program, or write the snippet to a scratch file and run it. When the program itself needs single quotes, a heredoc into `node` avoids both layers.
- **The same shape bit twice more in this repo.** A raw ESC byte pasted into a heredoc is refused by tool input validation, correctly, because a control character is invisible in an approval dialog. A `sed` meant to insert one produced a literal backslash plus the text u001b instead of the byte.
- **In a source file, build control characters with `String.fromCharCode(27)`.** A raw one is invisible in review, which is the same reason the sanitizer in [[claude-skills-system-reconcile-gate-render-mjs]] exists. This entry was itself written twice: the first draft carried a raw ESC byte in the prose.
