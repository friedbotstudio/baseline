// Ticket D — capture-leg idempotence across the flush boundary. Covers AC-006 and
// AC-012 of docs/specs/living-system-model-abcd.md (§Behavior #3).
//
// SCOUT WARNING encoded as tests: the capture leg is NOT un-deduped. It dedupes
// against the WRONG LIFETIME. memory_stop.mjs:262-274 builds existingKeys from the
// CURRENT _pending.md body and :373 skips on a hit — and tests/memory-stop-dedup.
// test.mjs guards exactly that. The re-emission happens because /memory-sync
// RESETS the body, discarding the dedup state along with the candidates.
//
// So ticket D's problem is PERSISTING A CURATION DECISION ACROSS THE RESET, not
// adding dedup. Framing it as the latter would duplicate working code and risk
// regressing that suite — which is why the third test here runs it.
//
// RED until the ledger exists.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { rmSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

import { makeProject, writeTranscript, readPending, tryImport } from './helpers/memory-fixtures.mjs';
import { runTestFile } from './helpers/memory-git-fixtures.mjs';

const LEDGER_MODULE = '.claude/skills/memory-sync/ledger.mjs';
const STOP_MODULE = '.claude/hooks/lib/memory_stop.mjs';

const PENDING_SKELETON = [
  '---',
  'owners: [memory_stop.mjs writes; /memory-sync clears]',
  '---',
  '',
  '# Pending memory candidates',
  '',
  '---',
  '',
].join('\n');

const INTENT_LINE = 'We should extract the canonical category list into one module later.';

describe('discard ledger (ticket D)', () => {
  it('test_when_candidate_discarded_at_flush_then_not_re_emitted_next_turn', async () => {
    const project = makeProject();
    try {
      const ledger = await tryImport(LEDGER_MODULE);
      assert.ok(ledger, `${LEDGER_MODULE} must exist`);
      const stop = await tryImport(STOP_MODULE);
      assert.ok(stop, `${STOP_MODULE} must be importable`);

      const transcript = writeTranscript(project.root, [INTENT_LINE]);

      // Turn 1 — the candidate is captured.
      stop.runMemoryStop({ transcript, pending: project.pending, projectRoot: project.root });
      const firstBody = readPending(project.pending);
      assert.match(firstBody, /## CANDIDATE:/, 'the candidate is captured on the first turn');

      const capturedKey = /^##\s+CANDIDATE:\s*(.+?)\s*$/m.exec(firstBody)[1];

      // The human discards it at /memory-sync, then the flush RESETS the body.
      ledger.recordCuration({ key: capturedKey, disposition: 'discarded' }, { rootDir: project.root });
      writeFileSync(project.pending, PENDING_SKELETON, 'utf8');

      // Turn 2 — same transcript, empty pending body. Pre-ticket-D this re-emits.
      stop.runMemoryStop({ transcript, pending: project.pending, projectRoot: project.root });

      assert.doesNotMatch(
        readPending(project.pending),
        new RegExp(capturedKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
        'a candidate discarded at one flush must not be re-emitted as fresh on the next turn — the ledger outlives the reset (AC-006)',
      );
    } finally {
      rmSync(project.root, { recursive: true, force: true });
    }
  });

  it('test_when_ledger_absent_then_capture_degrades_to_current_behavior', async () => {
    const project = makeProject();
    try {
      const ledger = await tryImport(LEDGER_MODULE);
      assert.ok(ledger, `${LEDGER_MODULE} must exist`);

      const ledgerPath = join(project.root, '.claude', 'memory', '_discard-ledger.md');
      assert.ok(!existsSync(ledgerPath), 'precondition: no ledger file on disk');

      let read;
      assert.doesNotThrow(() => {
        read = ledger.readLedger({ rootDir: project.root });
      }, 'an absent ledger must not throw (AC-012, rollout prerequisite P3)');
      assert.deepEqual(
        read,
        { promoted: [], discarded: [] },
        'an absent ledger reads as empty so memory_stop degrades to current behavior (AC-012)',
      );

      const stop = await tryImport(STOP_MODULE);
      assert.ok(stop, `${STOP_MODULE} must be importable`);
      const transcript = writeTranscript(project.root, [INTENT_LINE]);

      assert.doesNotThrow(() => {
        stop.runMemoryStop({ transcript, pending: project.pending, projectRoot: project.root });
      }, 'capture runs unchanged with no ledger present (AC-012)');
      assert.match(
        readPending(project.pending),
        /## CANDIDATE:/,
        'with no ledger, capture behaves exactly as it does today',
      );
    } finally {
      rmSync(project.root, { recursive: true, force: true });
    }
  });

  it('test_when_cross_invocation_dedup_runs_then_existing_behavior_unchanged', () => {
    // Regression trap. tests/memory-stop-dedup.test.mjs is in the contract's
    // untouched_regression_tests[] — its header names it a regression test for a
    // cross-invocation dedup bug. Ticket D extends that dedup's LIFETIME; it must
    // not add a second dedup or disturb the first. Asserted by running the suite,
    // never by editing it.
    const result = runTestFile('tests/memory-stop-dedup.test.mjs');
    assert.ok(
      result.ok,
      `the existing cross-invocation dedup suite must still pass unmodified — the ledger extends its lifetime, it does not replace it.\n${result.stdout}\n${result.stderr}`,
    );
  });
});
