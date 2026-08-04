---
key: governs-globs-under-a-phase-prefix-never-surface
category: landmines
scope: any
governs: .claude/hooks/process_lifecycle_guard.mjs,.claude/hooks/lib/governed-memory.mjs,.claude/hooks/lib/scoped-memory.mjs
load_bearing: true
verified-at: 39464a1
last-touched: 2026-08-04
---

- **The trap.** `process_lifecycle_guard`'s two write-leg surfacing triggers are **mutually exclusive**, not additive. A `governs:` glob that matches a path under `docs/specs/`, `docs/intake/`, `docs/scout/`, `docs/research/` or `docs/security/` surfaces **nothing** — the entry looks correctly tagged and is silently unreachable at that path.
- **Why.** `surfacePhaseScopedMemory` (`process_lifecycle_guard.mjs:76`) calls the path trigger only under `if (!phase)`. `surfaceGovernedMemoryFor` is terminal — every branch ends in `emitAllow()`, which is `process.exit(0)` (`.claude/hooks/lib/common.mjs:114`). So a path with a `PHASE_BY_PREFIX` match takes the phase trigger and the process exits before `governs:` is ever consulted; a path without one takes the governed trigger and exits before the phase branch. Whichever fires first is the only one that fires.
- **How to avoid it.** Write `governs:` globs against **source** paths. To surface an entry when a workflow artifact is authored, use `scope: <phase>` — that is the vocabulary the phase trigger reads. `scope:` means workflow phases; `governs:` means path globs; one field never covers the other's job (epic decision D3).
- **Consequence if ignored.** The failure is silent in the worst direction: no error, no empty-result warning, just an entry that never reaches the person editing the file it governs — the exact defect ticket C existed to close, re-created one prefix over.
- Companion: `.claude/hooks/process_lifecycle_guard.mjs:50`, `.claude/hooks/lib/governed-memory.mjs:51`.
