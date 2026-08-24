---
key: piping-a-command-to-tail-masks-its-exit-status
category: landmines
scope: [tdd, integrate, verify]
governs: .claude/skills/**
verified-at: 05d8fec
last-touched: 2026-08-24
---

- Trap: `cmd 2>&1 | tail -N` reports **tail's** exit status, not the command's. A pipeline's status is its LAST stage.
- Observed 2026-08-13 on `standup-remote-freshness`: `npm test 2>&1 | tail -25` printed `[exited with code 0]` while the suite was red. The real failure was a stale `obj/template/.claude/manifest.json` hash, and it had cascaded into every test calling `runRepoAudit`. The green reading was believed and the phase nearly advanced on it.
- Fix: redirect to a file and read the status separately — `cmd > out.tap 2>&1; echo "EXIT=$?" > out.exit` — then grep the file. For a long suite, background it and read both from disk.
- Do not reach for `set -o pipefail` as the fix here: it changes the status of every pipeline in the same shell, and the surrounding tooling does not expect that. Separating capture from status is local and unsurprising.
