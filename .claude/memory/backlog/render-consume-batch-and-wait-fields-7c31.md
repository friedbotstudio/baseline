---
key: render-consume-batch-and-wait-fields-7c31
category: backlog
scope: any
status: open
raised-on: 2026-07-19
raised-in-context: timing-instrument-repair
source: assistant-deferral
estimated-effort: small
verified-at: f36b142
last-touched: 2026-07-19
---

> verbatim (assistant, 2026-07-19):
> "The JSONL now carries batch_size 3 for that group, but renderTable doesn't yet read the new fields, so the rendered table still shows misleading zeros. The data is honest; the renderer hasn't caught up."

- Intent: make `renderTable` in `.claude/hooks/lib/timing.mjs` consume the three fields `stampFromWorkflow` now writes.
  1. **`batch_id` / `batch_size`** — a row in a batch of N currently renders `0 ms / 0 tokens`, which reads as "this phase was free". Render it as observed-with-N (or a marker) so the reader can tell unmeasured from free. Live example: `docs/archive/2026-07-19/timing-instrument-repair/timing.md`, rows `tdd:verify` and `tdd:finalize`.
  2. **`wait_ms`** — human-wait is still derived at render time from a single consent-token mtime (`firstWorkPhaseAfter` the last spec-family stamp), so only ONE gate per workflow gets attributed. The stored per-row `wait_ms` covers every gate; read it instead of re-deriving. This is what makes "share of calendar spent at consent gates" a field sum rather than a bespoke script.
- Why deferred: explicitly recorded as `out_of_scope` in `.claude/state/tdd/timing-instrument-repair.json` — the landing's contract was JSONL fidelity, and widening it to the renderer would have grown a diff the user had already flagged as over-ceremonied.
- Detail: [[phase-timer-collapses-phases-appended-in-one-workflow-json-write]] (status section), [[.claude/hooks/lib/timing.mjs]].
