---
key: timing-human-wait-is-always-zero-9b44
category: backlog
scope: [archive]
status: open
raised-on: 2026-08-06
raised-in-context: central-system-spec (`/archive` Step 2, rendering the bundle timing table)
source: assistant-deferral
estimated-effort: small (one line in attributeGaps + a test asserting a non-zero gate wait)
verified-at: d4e6216
last-touched: 2026-08-06
---

> Every archived `timing.md` reports Human-wait 0 on every row, so the column reads as "the human never waited" on every workflow ever archived.

**The defect.** `.claude/hooks/lib/timing.mjs:257` filters gate phases out of the rendered rows (`if (GATE_PHASES.has(phase)) continue;`) but `:259` still derives `prevEnd` from `stamps[i - 1]`, which **is** the gate stamp. The gate's own timestamp is written when the harness records the gate as completed, which is always *after* the consent token was written. So `human = Math.max(0, approveTokenMs - prevEnd)` takes the max of 0 and a negative number, every time.

**Measured on this workflow.** `approve-direction` stamped at `09:44:21.024`; approval token mtime `09:42:52.614`; rendered human-wait `0`. The true figure was already sitting in the log as `approve-direction.wait_ms = 245936` (4m 6s) — `phase_timer` records it correctly and the renderer discards it.

**Scope.** Structural, not situational: it fires on every workflow whose harness stamps a gate phase, which is the normal path. `docs/archive/*/*/timing.md` across the repo is affected retroactively.

**Fix direction.** `prevEnd` should skip gate stamps and use the last *non-gate* timestamp — the same set the render already filters on. Then the `tdd` row for this workflow reports ~157s of human wait against the token, and the `wait_ms` already in the log stays available as the gate's total span.

**Do not hand-edit a rendered `timing.md` to patch a number.** It is generated; the next render regenerates it wrong. Fix the renderer.

**Related.** [[phase-timer-collapses-phases-appended-in-one-workflow-json-write]] is the capture-side twin — this one is the render side. [[render-consume-batch-and-wait-fields-7c31]] already tracks the `wait_ms`/`batch_id` fields this renderer ignores; land them together.
