// evidence-ledger — AC-003 (append-only; 3 round-trips -> 3 entries, no lost writes)
// SUT: .claude/skills/harness/evidence-ledger.mjs (not yet built -> RED).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(new URL('../package.json', import.meta.url)));
const SUT = path.join(ROOT, '.claude/skills/harness/evidence-ledger.mjs');

describe('evidence-ledger (AC-003)', () => {
  it('test_when_three_roundtrips_append_then_no_lost_writes', async () => {
    const { appendRoundTrip, readLedger } = await import(SUT);
    const dir = mkdtempSync(path.join(tmpdir(), 'ledger-'));
    try {
      const file = path.join(dir, 'ledger.json');
      for (let i = 1; i <= 3; i++) {
        appendRoundTrip(file, { id: i, spec_path: `s${i}.md`, blocking: [], false_positive_blocks: 0 });
      }
      const led = readLedger(file);
      assert.equal(led.round_trips.length, 3, 'all three appends persisted');
      assert.deepEqual(led.round_trips.map((r) => r.id), [1, 2, 3]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('test_when_read_missing_ledger_then_empty', async () => {
    const { readLedger } = await import(SUT);
    const led = readLedger(path.join(tmpdir(), 'does-not-exist-xyz', 'ledger.json'));
    assert.deepEqual(led.round_trips, [], 'missing ledger reads as empty, not throw');
  });
});
