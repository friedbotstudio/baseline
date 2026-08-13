---
key: standup-gather-mjs-past-the-layer-split-guideline
category: backlog
scope: [simplify]
governs: .claude/skills/standup/gather.mjs
status: open
source: assistant-deferral
raised-on: 2026-08-13
raised-in-context: standup-remote-freshness
verified-at: c53a121
last-touched: 2026-08-13
---

> Splitting along the Orchestration/Domain/Foundation bands already marked in the file would need new files, which exceeds the write set and changes the shipped skill layout. That is a refactor, not cleanup.

- `.claude/skills/standup/gather.mjs` is ~460 lines, past the ~80-line substantive-code guideline in `code-structure`. The layer bands are already marked by comment (Orchestration / Domain: release, release model, backlog, pending questions, roadmap, remote freshness / Foundation: git, file, parsing).
- Deferred at `/simplify` pass 1 (2026-08-13) and accepted by the human. Splitting needs new files, which exceeded the approved write set and would change the shipped skill's file layout, so it is a refactor rather than a cleanup pass.
- The dead `parseEntries` the original flag also named WAS deleted in that pass, on the human's instruction. Only the length concern remains.
- Pair with `drift-check-probe-runnable-misses-await-dispatch-entry-points` — both were logged for the same follow-up spec.
