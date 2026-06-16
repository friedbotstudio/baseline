// tier-oracle-floor-dial — "all checkers wired" coverage oracle (AC-003, AC-006).
//
// This file IS the falsifiable claim that every canonical checker is wired:
//  (a) resolveAllCheckers returns exactly CANONICAL_CHECKERS under every tier;
//  (b) each canonical checker's representative file carries the read-path marker.
// RED until tier-dial.mjs exists AND each representative file gains the marker.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIAL = join(REPO_ROOT, '.claude/hooks/lib/tier-dial.mjs');
const load = () => import(DIAL);

const TIERS = ['internal-tool', 'customer-data', 'regulated'];
const EXPECTED = ['brainstorm', 'spec', 'tdd', 'security', 'review', 'ac-conformance'];

// The single documented token every wired consumer carries, naming the accessor
// as its floor/ceiling source. The coverage test scans for this exact substring.
const MARKER = 'tier-dial:read-path';
const REPRESENTATIVES = {
  brainstorm: '.claude/skills/brainstorm/SKILL.md',
  spec: '.claude/skills/spec-lint/SKILL.md',
  tdd: 'scripts/mutation-oracle.mjs',
  security: '.claude/skills/security/SKILL.md',
  review: '.claude/skills/simplify/SKILL.md',
  'ac-conformance': '.claude/skills/integrate/SKILL.md',
};

describe('tier-dial coverage (all checkers wired)', () => {
  for (const level of TIERS) {
    it(`test_when_resolveAllCheckers_${level}_then_keys_equal_canonical_set`, async () => {
      const { resolveAllCheckers } = await load();
      const all = resolveAllCheckers({ projectJson: { tier: { level } } });
      assert.deepEqual(Object.keys(all).sort(), [...EXPECTED].sort());
    });
  }

  it('test_when_each_canonical_checker_then_representative_skill_has_marker', () => {
    for (const checker of EXPECTED) {
      const rel = REPRESENTATIVES[checker];
      const src = readFileSync(join(REPO_ROOT, rel), 'utf8');
      assert.ok(src.includes(MARKER), `${checker}: ${rel} missing read-path marker '${MARKER}'`);
    }
  });
});
