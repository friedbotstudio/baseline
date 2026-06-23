// Domain: record a peer's escalated fork and the lead's arbitration onto the durable
// plan lineage. Under Article X a peer decides its own in-lane choices; what reaches
// here is an escalated cross-lane/un-decidable fork the lead resolves in main context
// (and may relay to the human). Both append an auditable, append-only revision via the
// harness plan-store (monotonic versions).

import { currentSnapshot, recordRevision } from '../harness/plan-store.mjs';

export async function recordYield(plan, { task_id, fork_desc, peer_id }) {
  const snapshot = currentSnapshot(plan);
  const yields = [...(snapshot.yields || []), { task_id, fork_desc, status: 'open' }];
  return recordRevision(plan, { ...snapshot, yields }, {
    author: peer_id,
    reason: `escalate ${task_id}: ${fork_desc}`,
  });
}

export async function recordArbitration(plan, { task_id, resolution }) {
  const snapshot = currentSnapshot(plan);
  const yields = (snapshot.yields || []).map((y) => (
    y.task_id === task_id ? { ...y, status: 'resolved', resolution } : y
  ));
  return recordRevision(plan, { ...snapshot, yields }, {
    author: 'lead',
    reason: `arbitrated ${task_id}: ${resolution}`,
  });
}
