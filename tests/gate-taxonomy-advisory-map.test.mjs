// C6 — advisory map (docs/specs/gate-taxonomy.md, AC-005).
// RED until .claude/hooks/lib/gate-taxonomy.mjs exists.
// The map is advisory / test-only: it proves each live consent point resolves to
// exactly one XI.12 category, without changing any enforcement.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MOD = join(REPO_ROOT, '.claude/hooks/lib/gate-taxonomy.mjs');

// Every live consent point named in AC-005 must appear in the map.
const LIVE_CONSENT_POINTS = [
  'spec_approval_guard',
  'swarm_approval_guard',
  'git_commit_guard.commit_consent',
  'git_commit_guard.push_consent',
  'git_commit_guard.FORBIDDEN_RE',
  'destructive_cmd_guard',
  'epic_approval_guard',
  'gitignore_leak_guard',
  'branch_guard',
];

describe('C6 CONSENT_POINT_MAP (AC-005)', () => {
  it('test_when_map_read_then_frozen', async () => {
    const { CONSENT_POINT_MAP } = await import(MOD);
    assert.ok(Object.isFrozen(CONSENT_POINT_MAP), 'CONSENT_POINT_MAP must be frozen');
  });

  it('test_when_each_live_consent_point_then_present_and_valid_category', async () => {
    const { CONSENT_POINT_MAP, CATEGORIES } = await import(MOD);
    const categorySet = new Set(CATEGORIES);
    for (const point of LIVE_CONSENT_POINTS) {
      assert.ok(point in CONSENT_POINT_MAP, `missing consent point: ${point}`);
      const cat = CONSENT_POINT_MAP[point];
      assert.ok(categorySet.has(cat), `${point} -> '${cat}' is not a valid category`);
    }
  });

  it('test_when_map_values_then_subset_of_categories', async () => {
    const { CONSENT_POINT_MAP, CATEGORIES } = await import(MOD);
    const categorySet = new Set(CATEGORIES);
    for (const [point, cat] of Object.entries(CONSENT_POINT_MAP)) {
      assert.ok(categorySet.has(cat), `${point} -> '${cat}' not in CATEGORIES`);
    }
  });

  it('test_when_map_categories_then_policy_flip_reachable', async () => {
    // branch_guard proves the map spans beyond the two obvious categories.
    const { CONSENT_POINT_MAP } = await import(MOD);
    const values = new Set(Object.values(CONSENT_POINT_MAP));
    assert.ok(values.has('policy-flip'), 'branch_guard should map to policy-flip');
    assert.ok(values.has('consent-adjacent-scope'));
    assert.ok(values.has('irreversible-destructive'));
  });
});
