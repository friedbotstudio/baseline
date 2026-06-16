// tier-oracle-floor-dial — accessor unit tests (AC-001, AC-002, AC-006 resilience).
//
// RED until .claude/hooks/lib/tier-dial.mjs exports readTier /
// resolveCheckerThreshold / resolveAllCheckers with the spec's DEFAULT_PROFILES.
// projectJson is injected as a real fixture object — no fs/module mocks.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIAL = join(REPO_ROOT, '.claude/hooks/lib/tier-dial.mjs');
const load = () => import(DIAL);

describe('tier-dial accessor', () => {
  it('test_when_tier_level_absent_then_defaults_to_internal_tool', async () => {
    const { readTier } = await load();
    assert.equal(readTier({ projectJson: {} }), 'internal-tool');
    assert.equal(readTier({ projectJson: { tier: {} } }), 'internal-tool');
  });

  it('test_when_tier_regulated_then_resolves_profile_values', async () => {
    const { resolveCheckerThreshold } = await load();
    const r = resolveCheckerThreshold('tdd', { projectJson: { tier: { level: 'regulated' } } });
    assert.deepEqual(r, {
      tier: 'regulated', checker: 'tdd',
      floor: 0.85, ceiling: 3, mandatory: true, source: 'profile',
    });
    assert.equal(resolveCheckerThreshold('tdd', { projectJson: { tier: { level: 'internal-tool' } } }).floor, 0.0);
    assert.equal(resolveCheckerThreshold('tdd', { projectJson: { tier: { level: 'customer-data' } } }).floor, 0.70);
  });

  it('test_when_unknown_checker_then_default_threshold', async () => {
    const { resolveCheckerThreshold } = await load();
    const r = resolveCheckerThreshold('not-a-checker', { projectJson: { tier: { level: 'regulated' } } });
    assert.equal(r.floor, null);
    assert.equal(r.ceiling, 1);
    assert.equal(r.mandatory, false);
    assert.equal(r.source, 'default');
  });

  it('test_when_override_present_then_override_wins_per_field', async () => {
    const { resolveCheckerThreshold } = await load();
    const r = resolveCheckerThreshold('tdd', {
      projectJson: { tier: { level: 'regulated', overrides: { tdd: { floor: 0.50 } } } },
    });
    assert.equal(r.floor, 0.50);
    assert.equal(r.ceiling, 3, 'ceiling stays the regulated profile value');
    assert.equal(r.mandatory, true, 'mandatory stays profile');
    assert.equal(r.source, 'override');
  });

  it('test_when_project_json_missing_or_invalid_then_defaults_no_throw', async () => {
    const { resolveCheckerThreshold } = await load();
    assert.doesNotThrow(() => resolveCheckerThreshold('tdd'));
    assert.doesNotThrow(() => resolveCheckerThreshold('tdd', { projectJson: null }));
    assert.doesNotThrow(() => resolveCheckerThreshold('tdd', { projectJson: 'garbage' }));
    const r = resolveCheckerThreshold('tdd', { projectJson: 'garbage' });
    assert.ok(['internal-tool', 'customer-data', 'regulated'].includes(r.tier), 'falls back to a real tier');
  });
});
