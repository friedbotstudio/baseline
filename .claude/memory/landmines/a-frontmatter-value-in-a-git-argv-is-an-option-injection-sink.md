---
key: a-frontmatter-value-in-a-git-argv-is-an-option-injection-sink
category: landmines
load_bearing: false
scope: [implement, security, integrate]
governs: .claude/hooks/lib/staleness.mjs, .claude/skills/memory-sync/sweep.mjs, .claude/hooks/lib/memory_session_start.mjs
verified-at: 05d8fec
last-touched: 2026-08-24
---

- **The trap.** `spawnSync('git', [...args])` with an array and no shell stops *command* injection and does nothing about *argument* injection. git reads any argument beginning with `-` as an option, so a value interpolated into a revision position is an option sink.
- **Measured 2026-08-23** in `staleness-witness`. A memory entry with `verified-at: --output=<path>` produced `git diff --name-only --output=<path>..HEAD`, which **exited 0** and wrote `<path>..HEAD` on disk. The predicate reported a normal verdict while an arbitrary file appeared. Session start evaluates every entry in the store, so it fired on every session.
- **A `--` terminator does not help.** The injected text is the revision argument itself, not a pathspec, so there is nothing for the terminator to separate.
- **The exit status is the part that hides it.** The prior code used `git rev-list --count ${stamp}..HEAD`, which accepted `--output=` too and created the same file, then failed at 129 so the caller saw an error. Moving to `git diff` kept the hole and removed the noise. When you swap one git subcommand for another, re-check what the new one accepts.
- **The fix that holds.** Validate before interpolating: a stamp is `/^[0-9a-f]{7,40}$/` and nothing else, and a rejected one is treated exactly like an unresolvable one. `usableStamp` in `.claude/hooks/lib/staleness.mjs` is the shared predicate both callers gate on.
- **Where to look next.** Any other reader that interpolates a frontmatter value into a git argv has the same shape. The 2026-08-23 review covered only the two in that diff.
