// erp-portables slice DEF (E) — AC-005 boundary
//
// Brainstorm Stage 2 probe-loop terminates after 2 iterations when gaps remain
// (derivation-first: only underivable, build-changing gaps probe — cap tightened
// 5 → 2); Stage 3 fires with partial brief; open_questions enumerates unclosed
// gaps.
//
// SUT: .claude/skills/brainstorm/probe-loop.mjs

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const HERE = path.dirname(__filename);
const REPO_ROOT = path.resolve(HERE, '..');

let probeLoop;
try {
  probeLoop = await import(path.join(REPO_ROOT, '.claude/skills/brainstorm/probe-loop.mjs'));
} catch (err) {
  throw new Error(
    `.claude/skills/brainstorm/probe-loop.mjs not yet implemented. Original: ${err.message}`
  );
}

describe('brainstorm probe-loop iteration cap (AC-005 boundary)', () => {
  it('test_when_probe_loop_gaps_remain_then_cap_is_exactly_2', () => {
    const gaps = ['actor', 'trigger', 'current_state', 'desired_state', 'non_goals', 'leakage'];
    // ambiguous-answer function: always returns a non-closing answer
    const askFn = (_q) => ({ closed: false, answer: 'I am not sure yet' });

    const result = probeLoop.runProbeLoop({ gaps, askFn });
    assert.equal(result.iterations, 2, 'iteration cap is exactly 2 (derivation-first, 5 → 2)');
    assert.ok(result.open_questions.length > 0, 'unclosed gaps surface as open_questions');
    assert.ok(result.advanced_to_stage_3, 'after cap, advances to Stage 3 anyway');
  });

  it('test_when_all_gaps_close_before_cap_then_advance_early', () => {
    const gaps = ['actor', 'trigger'];
    const askFn = (_q) => ({ closed: true, answer: 'precise answer' });

    const result = probeLoop.runProbeLoop({ gaps, askFn });
    assert.ok(result.iterations <= 2, 'closes early when all gaps resolved');
    assert.equal(result.open_questions.length, 0);
    assert.ok(result.advanced_to_stage_3);
  });
});
