---
key: zsh-recursive-glob-makes-grep-block-on-stdin-e5b1
category: conventions
scope: [scout, document, simplify, integrate]
source: assistant-deferral
raised-on: 2026-08-10
raised-in-context: warm-context-diet
verified-at: 05d8fec
last-touched: 2026-08-24
governs: .claude/skills/**/SKILL.md
---

> It cost 15 minutes of a held shell and produced no output.

- **The trap.** This repo's shell runs with `NO_EXTENDED_GLOB`, so `grep -rln 'pat' site-src/**/*.njk` does not expand. zsh passes the literal `**` through, grep finds no such file, and with `-r` and no valid path operand it falls back to **reading stdin** and blocks forever. The command never returns and never errors.
- **What it looks like.** A background shell alive for 15 minutes on a search across ~20 small files, with an empty output file. `ps` shows the full command still resident.
- **The form that works** is a directory plus a filter: `grep -rln 'pat' site-src --include='*.njk'`. It is also faster and portable to bash.
- **Related, same session:** an over-greedy inspection regex (`[^<>]{0,130}word[^<>]{0,130}`) backtracked catastrophically on the same `.njk` files and hit the 60s timeout. For "show me the context around a match", prefer `grep -nF 'literal' file | cut -c1-220` over a two-sided bounded-repetition regex.
- **General rule for one-off shell inspection in this repo:** literal strings with `-F`, explicit directories with `--include`, and `cut` for width. Save regex for cases where the pattern is the point.
