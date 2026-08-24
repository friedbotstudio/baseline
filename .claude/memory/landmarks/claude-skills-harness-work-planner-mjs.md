---
key: .claude/skills/harness/work-planner.mjs
category: landmarks
scope: []
governs: .claude/skills/harness/work-planner.mjs, .claude/skills/harness/verdict.mjs, .claude/skills/harness/proposal.mjs, .claude/skills/harness/envelope.mjs, .claude/skills/harness/timing-corpus.mjs, .claude/skills/harness/payload-estimate.mjs
role: Orchestration for the envelope check — composes envelopeFor, measurePayload and classify, then proposes backlog work below the 4x target. The two thresholds live ONLY in verdict.mjs (FLOOR 3, TARGET 4); a caller reimplementing the comparison is how "acceptable" drifts. timing-corpus.mjs is the Foundation half and encodes the load-bearing row rule: worker-tick sub-rows anchor at the parent's START and sum to its rollup, so counting them double-counts payload, while attempt-k retries anchor at the parent's COMPLETION and are cost the parent row does not carry. Both render with the same leading marker, so the prefix alone cannot separate them. Gated by velocity.work_planner.enabled, default off.
source: inferred-from-code
verified-at: 05d8fec
last-touched: 2026-08-24
---


