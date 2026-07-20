---
key: hook-script-shape
category: conventions
scope: [scenario, implement, tdd]
verified-at: HEAD
last-touched: 2026-05-28
---

- Convention: every `.claude/hooks/*.mjs` script imports `lib/common.mjs` and calls `readPayload()` first. Decision emitters: `emitAllow`, `emitBlock`, `emitAsk`, `emitInfo`. JSON parsing native (no `jq`, no python heredoc); skill helpers follow the same Node ESM pattern.
- Why: ~5x faster startup than the legacy bash + python3 chain; one runtime to install; uniform error handling.
