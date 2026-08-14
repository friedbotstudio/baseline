---
key: census-gate-literal-pattern-matches-no-real-site
category: backlog
scope: []
governs: .claude/skills/memory-sync/census-gate.mjs,.claude/skills/memory-sync/census-measures.mjs
status: open
source: assistant-deferral
deferred: cost
raised-on: 2026-08-14
raised-in-context: release-readiness
verified-at: 66fcb29
last-touched: 2026-08-14
---

> The census gate refuses correctly and pins nothing real. Its pattern matches the shape its own fixture used, and none of the three shapes the repository actually has.

- **Measured 2026-08-14, on the gate's first live run, in the flush of the batch that built it.** `literalPattern` is `(SYMBOL\s*=\s*)(\d+)`. The three census sites this repo carries are none of them that shape:
  - `assert.equal(atScout.length,\n      94,` — an assertion argument, on its own line
  - `const PHASE_BUDGETS = { spec: 88, ... }` — an object property
  - `'.claude/hooks/lib/scoped-memory.mjs': 9,` — an object property with a quoted key
- **What happened.** This workflow's own `/memory-sync` filed three landmarks at `scope: [scout]`, moving the landmark census 91 → 94. That is precisely the movement AC-005 exists to catch. The gate returned `{refused: true, reason: "symbol atScout.length not found"}` — it could not locate the site, so it never reached the question of re-measuring it. The literal was corrected **by hand**, which is the cost the gate was built to remove.
- **The refusal is not the defect.** Refusing on an unresolvable site is the designed fail-safe and it worked: nothing was written stale, and the verdict named the site. The defect is reach — a gate that refuses on every real site is a gate that is never satisfied, and a curator who sees `refused` every flush will learn to route around it.
- **This is the failure class this same batch named for `probeRunnable` and then reproduced.** T3's entry says a fixture-only test "leaves the same hole one entry-point shape over, which is exactly how this shipped," and T3's repair added a live-oracle test over every shipped `cli.mjs`. T2 shipped with a fixture and no live oracle, and has the same hole one literal-shape over.
- **Shape of the fix, two halves.** (1) Broaden the matcher to the shapes that exist — object property (`key: <digits>`) and call argument — or key sites by file+line rather than by symbol. (2) Declare the sites somewhere the gate can read, since `sites[]` is a caller-supplied parameter today and no caller supplies it; without a declared list the gate is unreachable from `/memory-sync` in practice.
- **The test that would have caught it.** A live-oracle assertion that every census literal this repo declares resolves through `measureCensusMovement` — the same relational shape T3 used. Reason `cost`: this needs a config surface plus a broader parser, which is more than a follow-on tweak.
- Related: [[derive-the-memory-census-literals-or-gate-them-at-write-time]] is the entry this batch was closing; it is only half closed. [[anti-drift-tests-compare-against-the-live-oracle-b4d2]] is the convention both halves point at.
