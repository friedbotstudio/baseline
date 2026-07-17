---
key: derived-header-mirror-exemption-2026-07-15
category: decisions
scope: [spec]
source: assistant-deferral (implementation-time discovery, human-confirmed narrowing)
verified-at: e9f6961
last-touched: 2026-07-15
---

- Decision: The derived-header mechanism (`.claude/hooks/lib/derived-header.mjs` — marker + `EXEMPT_RELPATHS` + `isExempt`/`hasDerivedHeader`/`stampText`) stamps a "generated, do-not-edit" banner on derived files, but the **constitution mirrors** (`src/CLAUDE.template.md`, `src/seed.template.md`, and their `obj/template/` outputs) are **EXEMPT**. Their drift guard is byte-equality with a human-edited live source (`sync-constitution-mirror --check`); a header would both break that equality and dishonestly banner a source humans DO edit. `audit-baseline`'s `checkMirrorsUnstamped` enforces the exemption (a mirror carrying the banner FAILs, with a clearer message than a raw byte-diff).
- The build-STAMP half was DROPPED (roadmap T3, backlog `-e9c1`): every derived file in this repo is either an exempt mirror **or** `obj/template/**`, which is gitignored build output regenerated on every build — a do-not-edit header there prevents nothing (nobody hand-edits a file that is `rm -rf`'d each build). So there is no valuable committed file to stamp today (YAGNI, VI.4). `stampText` is the ready mechanism for a future genuine target; `verifyStamped` (the eligible-set audit half) was dropped with the build-stamp to avoid dead code.
- Why record: prevents a future attempt to wire build-stamping (no valuable target) and re-litigating the mirror collision. The design call's answer IS "the mirrors are exempt; nothing else is worth stamping."
- Provenance: landed via the `debt-hardening-batch` power batch (T3 slice); scope narrowed at the implement-tick after the no-valuable-target discovery, spec re-approved at gate A. Archive: `docs/archive/2026-07-15/debt-hardening-batch/`.
