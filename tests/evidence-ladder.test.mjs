// A2 — evidence-shape ladder. RED until evidence-ladder.mjs exists.
// Covers: AC-201 (cumulative rung set), AC-202 (presence check + missing rung),
// AC-203 (D3 invariance to length/authorship).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const EL = join(REPO_ROOT, '.claude/skills/spec/evidence-ladder.mjs');

describe('A2 evidence-shape ladder', () => {
  it('test_when_evidenceShapeFor_A_then_all_rungs', async () => {
    const { evidenceShapeFor } = await import(EL);
    assert.deepEqual(evidenceShapeFor('A').rungs, ['authorize', 'understanding', 'reasoning', 'alternatives', 'tradeoffs', 'confidence']);
  });

  it('test_when_evidenceShapeFor_D_then_authorize_only', async () => {
    const { evidenceShapeFor } = await import(EL);
    assert.deepEqual(evidenceShapeFor('D').rungs, ['authorize']);
  });

  it('test_when_evidenceShapeFor_cumulative', async () => {
    const { evidenceShapeFor } = await import(EL);
    assert.deepEqual(evidenceShapeFor('C').rungs, ['authorize', 'understanding']);
    assert.deepEqual(evidenceShapeFor('B').rungs, ['authorize', 'understanding', 'reasoning']);
  });

  it('test_when_checkEvidenceShape_B_missing_reasoning_then_not_ok', async () => {
    const { checkEvidenceShape } = await import(EL);
    const v = checkEvidenceShape('B', { authorize: 'me', understanding: 'why' });
    assert.equal(v.ok, false);
    assert.deepEqual(v.missing, ['reasoning']);
  });

  it('test_when_checkEvidenceShape_all_present_then_ok', async () => {
    const { checkEvidenceShape } = await import(EL);
    const v = checkEvidenceShape('B', { authorize: 'me', understanding: 'why', reasoning: 'because' });
    assert.equal(v.ok, true);
    assert.deepEqual(v.missing, []);
  });

  it('test_when_checkEvidenceShape_same_class_diff_length_then_identical', async () => {
    const { checkEvidenceShape } = await import(EL);
    const short = checkEvidenceShape('B', { authorize: 'a', understanding: 'b', reasoning: 'c' });
    const long = checkEvidenceShape('B', {
      authorize: 'a'.repeat(500),
      understanding: 'b'.repeat(500),
      reasoning: 'c'.repeat(500),
    });
    assert.deepEqual(short, long, 'verdict invariant to length/authorship (D3)');
  });
});
