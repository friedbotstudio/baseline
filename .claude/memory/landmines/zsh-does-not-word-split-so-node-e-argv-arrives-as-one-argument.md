---
key: zsh-does-not-word-split-so-node-e-argv-arrives-as-one-argument
category: landmines
load_bearing: true
scope: [archive, tdd, integrate, verify, chore]
governs: .claude/skills/*/SKILL.md,.claude/hooks/**,scripts/**
verified-at: 3c08c8a
last-touched: 2026-08-26
---

- **The trap.** This repo's shell is zsh (`ZSH_VERSION=5.9`, `/bin/zsh`). Unlike bash, zsh does **not** word-split an unquoted parameter expansion. So `node -e "...process.argv.slice(1)..." $PATHS` passes **one** argument containing spaces, not N arguments. Any helper that expects a list receives a single malformed string.
- **Proof.** `P="a b"; node -e "console.log(JSON.stringify(process.argv))" $P` prints `["/…/node","a b"]`. The same line under bash prints three entries. `echo $P | wc -w` reports 2 either way, so a word-count sanity check *passes* while the call still gets one argument — the check and the failure disagree.
- **Observed 2026-08-06 (central-system-spec).** `/archive` Step 5's sync-back was invoked with 22 governed-surface paths in a shell variable. All 22 arrived as one string, matched no element anchor, and `syncBack` returned `{applied:[],proposed:[]}` — which is *exactly* what an honest "nothing relevant changed" looks like. The step had just been written that cycle, so its first real execution silently did nothing and reported success. Passing the same paths as a quoted JSON array applied 8 elements.
- **The rule.** In a documented `node -e` command, pass a list as **one quoted argument** and parse it inside: `'["a","b"]'` with `JSON.parse(process.argv[1])`. A single quoted argument behaves identically in zsh and bash. Never rely on word-splitting in a command that ships in a SKILL.md, because the shell that runs it is not chosen by the author.
- **Second-order rule, the one that actually bites.** A helper that returns an empty result for "you passed me nothing" and for "nothing matched" is unfalsifiable from the outside. When a step reports zero, prove the input was non-empty before believing it. `syncBack` still has this ambiguity — see [[syncback-applied-overstates-what-it-stamped-8e21]].
- **Family.** Same failure class as [[a-check-that-measured-nothing-reports-success]]: the check ran, measured nothing, and green and silent were the same pixel. Related: [[verification-harness-misreports-more-often-than-the-subject-fails]].
