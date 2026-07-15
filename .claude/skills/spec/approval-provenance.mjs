// A4 (roadmap Epic 2) — derive the /approve-spec token FROM a provenance-anchored
// evidence-ledger entry, rather than writing a bare token alongside one.
//
// The consent marker (written outside Claude by consent_gate_grant) remains the
// sole source of human consent; this ADDS a provenance anchor so the token
// attests which Governance Class, evidence verdict, and spec content it was
// granted against. Scope: the /approve-spec gate only.
//
// verifyApprovalAnchor lives in the hook lib so the guard and this skill share
// one implementation; it is re-exported here for the harness-side approve-spec
// flow and the unit tests.

import { assertSafeSlug } from '../harness/plan-store.mjs';

export { verifyApprovalAnchor as verifyAnchor, parseAnchorRef } from '../../hooks/lib/approval-anchor.mjs';

// deriveApprovalToken(...) → the multi-line token body. Line 6 is the provenance
// anchor `ledger_ref: <entry-id>`. Rejects an unsafe slug before any use
// (CWE-22, REJECT-never-repair — same guard as plan-store).
export function deriveApprovalToken({ slug, ledgerEntry, specHash, epoch, absPath, gitSha } = {}) {
  assertSafeSlug(slug);
  const ref = ledgerEntry && ledgerEntry.id;
  if (!ref) throw new Error('deriveApprovalToken: ledgerEntry.id is required for the provenance anchor');
  return [
    'APPROVED',
    String(epoch),
    absPath,
    gitSha || 'N/A',
    specHash,
    `ledger_ref: ${ref}`,
  ].join('\n') + '\n';
}
