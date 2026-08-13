---
key: a-spec-amendment-after-gate-a-is-cheap-and-mechanised
category: decisions
scope: [spec, approve-direction]
governs: docs/specs/**
source: assistant-deferral
verified-at: c53a121
last-touched: 2026-08-13
---

- Decision: when a defect is found after gate A that the spec does not cover, amend the spec and re-approve. Do not carry the gap forward as a follow-up because re-approval feels expensive. It is not.
- Mechanism, observed working on `standup-remote-freshness` (2026-08-13): editing `docs/specs/<slug>.md` changed its content hash, `compareSpecHash(tokenHash, bytes)` returned false against the token's line 5, and `/harness` re-yielded at gate A on its own. No manual revoke was needed.
- The correct response: rewind `workflow.json → completed` to the phases the amendment did not invalidate (here `["spec"]`), reset the downstream TaskList entries to pending, delete the stale tdd worker ticks so a re-run is not misread as already-green, re-run the review chain, and re-approve. Record the rewind in `workflow.json → spec_amendments` with the evidence that forced it.
- Cost measured: one gate-A cycle. The alternative was shipping a verdict that claimed a verification it had not performed.
