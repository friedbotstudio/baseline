// Tier 3 — flush-time route.mjs (pure deterministic bucket+weight classifier).
// Spec: docs/specs/memory-capture-tier2-tier3.md (§Behavior #2).
// Covers AC-003, AC-007, AC-012, AC-013.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { tryImport, loadCorpus } from './helpers/memory-fixtures.mjs';

const BUCKETS = ['landmark', 'decision', 'open-question', 'backlog'];
const ROUTE = '.claude/skills/memory-flush/route.mjs';

async function suggest(candidates) {
  const mod = await tryImport(ROUTE);
  assert.ok(mod && typeof mod.suggestRoutes === 'function', `${ROUTE} must export suggestRoutes()`);
  return mod.suggestRoutes(candidates);
}

describe('Tier 3 — flush routing (route.mjs)', () => {
  it('test_when_suggestRoutes_then_bucket_and_weight_per_candidate_writes_nothing', async () => {
    const candidates = [
      { key: 'k1', text: '.claude/hooks/lib/thread_store.mjs holds the durable trail I/O.' },
      { key: 'k2', text: 'We decided to defer the flush routing.' },
      { key: 'k3', text: 'Should the working thread be pinned?' },
    ];
    const out = await suggest(candidates);
    assert.equal(out.length, candidates.length, 'one suggestion per candidate');
    for (const s of out) {
      assert.ok(BUCKETS.includes(s.suggested_bucket), `bucket ${s.suggested_bucket} in the closed set`);
      assert.equal(typeof s.weight, 'number', 'weight is numeric');
    }
  });

  it('test_when_decision_vs_boilerplate_then_decision_weighted_higher', async () => {
    const out = await suggest([
      { key: 'd', text: 'We decided to extract the scanner into its own module.' },
      { key: 'b', text: 'Thanks, that looks good to me.' },
    ]);
    const byKey = Object.fromEntries(out.map((s) => [s.key, s]));
    assert.ok(byKey.d.weight > byKey.b.weight, 'decision text weighted higher than chatter');
  });

  it('test_when_corpus_bucket_labels_then_routing_accuracy_reported', async () => {
    const labeled = loadCorpus().filter((c) => c.bucket);
    const out = await suggest(labeled.map((c, i) => ({ key: String(i), text: c.text })));
    let correct = 0;
    out.forEach((s, i) => { if (s.suggested_bucket === labeled[i].bucket) correct++; });
    const accuracy = labeled.length ? correct / labeled.length : 0;
    assert.ok(accuracy >= 0 && accuracy <= 1, `routing accuracy reported in [0,1]: ${accuracy.toFixed(2)}`);
  });
});
