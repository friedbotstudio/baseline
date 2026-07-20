// shard-migration-repair — AC-016 (the handoff spine records CO-E as shipped).
//
// Same bug class as the code readers: a reader stale about work that already
// happened. docs/handoff/baseline-system-redesign-roadmap.md §5 and §6 both show
// CO-E (gate-collapse) as unshipped, but it landed 2026-07-16 via d0166c3 (test
// suite) + c3e1e3e (decision + archive bundle), confirmed by the canonical memory
// entry decisions/gate-collapse-approve-direction-at-intake-2026-07-16.md.
//
// The doc's own §6 warns that conflating "brief written" with "change shipped"
// once let a shipped change read as pending; it then drifted a full loop behind
// reality again. With CO-E marked, the change-order set is complete.
//
// RED until: §5 and §6 mark CO-E shipped with both SHAs.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT } from './helpers/memory-fixtures.mjs';

const SPINE_REL = 'docs/handoff/baseline-system-redesign-roadmap.md';

function coeLines(text) {
  return text.split('\n').filter((l) => /CO-E/.test(l));
}

describe('handoff spine — CO-E marked shipped (AC-016)', () => {
  it('test_when_handoff_roadmap_read_then_coe_marked_shipped', () => {
    const text = readFileSync(join(REPO_ROOT, SPINE_REL), 'utf8');
    const lines = coeLines(text);
    assert.ok(lines.length > 0, 'the spine still discusses CO-E');

    assert.match(text, /d0166c3/, 'cites the gate-collapse test-suite commit');
    assert.match(text, /c3e1e3e/, 'cites the decision + archive-bundle commit');

    const stillUnshipped = lines.filter((l) => /⬜/.test(l) || /\bunblocked\b/i.test(l));
    assert.deepEqual(stillUnshipped, [],
      `CO-E must no longer read as unshipped; offending lines:\n${stillUnshipped.join('\n')}`);

    const ledgerRow = lines.find((l) => /^\|\s*CO-E\s*\|/.test(l.trim()));
    assert.ok(ledgerRow, 'the §6 status-ledger row for CO-E is present');
    assert.match(ledgerRow, /✅/, 'the ledger Shipped column is ticked');

    assert.match(text, /AC2/,
      'the spine records that the shipped shape revises CO-E\'s own AC2 — gate A moved to intake and the reference target is machine-enforced at spec time');
  });
});
