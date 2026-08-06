// harden-power-track-debt batch gate — the audit stays green after the batch lands.
//
// AC-011: the drift oracle and CI both gate on audit-baseline; assert it directly
// rather than trusting a downstream phase to notice. (AC-012, "full suite green",
// is a universal integrate invariant, not an acceptance criterion of this change —
// see spec Rollout; it is not represented as an AC here.)

import { describe, it } from 'node:test';
import { runRepoAudit } from './helpers/audit-repo.mjs';

describe('the baseline audit stays green after the batch', () => {
  // AC-011
  it('test_when_audit_baseline_runs_then_it_exits_zero', () => {
    runRepoAudit({ label: 'harden-batch-audit-green' });
  });
});
