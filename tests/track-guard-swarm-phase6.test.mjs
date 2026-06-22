// track_guard — swarm Phase-6 ordering equivalence (D3 of swarm-mode-first-run-hardening).
// The swarm path (swarm-plan → approve-swarm → swarm-dispatch) IS Phase 6 (CLAUDE.md
// Article IV 6a/6b/6c). `tdd` has no artifact glob, so its prereq resolves via
// completed-membership; a swarm build records `swarm-dispatch`, not `tdd`, and must
// still satisfy the `tdd` ordering slot so downstream phases (e.g. /security) aren't
// false-blocked. The pure helper is extracted to hooks/lib so the test never executes
// the hook's top-level payload read.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { phaseSatisfied } from '../.claude/hooks/lib/track-order.mjs';

test('D3: swarm-dispatch in completed satisfies the tdd Phase-6 slot', () => {
  const completed = new Set(['intake', 'spec', 'swarm-plan', 'approve-swarm', 'swarm-dispatch']);
  assert.equal(phaseSatisfied('tdd', completed), true);
});

test('D3 regression: neither tdd nor swarm-dispatch present → tdd slot NOT satisfied (no false-allow)', () => {
  assert.equal(phaseSatisfied('tdd', new Set(['intake', 'scout'])), false);
});

test('D3 regression: literal tdd in completed → satisfied (solo path unchanged)', () => {
  assert.equal(phaseSatisfied('tdd', new Set(['tdd'])), true);
});

test('D3 regression: the swarm equivalence is tdd-only — other phases use plain membership', () => {
  assert.equal(phaseSatisfied('scout', new Set(['scout'])), true);
  assert.equal(phaseSatisfied('scout', new Set(['swarm-dispatch'])), false);
  // a completed swarm-dispatch must NOT satisfy an unrelated later phase
  assert.equal(phaseSatisfied('security', new Set(['swarm-dispatch'])), false);
});
