// Live-vs-template config parity — the shipped consumer template
// (src/project.template.json) must not silently drift from the live
// .claude/project.json for enforcement-oracle posture. SUT: the exported
// checkConfigParity / CONFIG_PARITY_ALLOWLIST in the audit-baseline skill
// (not yet exported -> RED). Governance scenario reads the real on-disk files.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { checkConfigParity, CONFIG_PARITY_ALLOWLIST }
  from '../.claude/skills/audit-baseline/audit.mjs';

const ROOT = path.dirname(fileURLToPath(new URL('../package.json', import.meta.url)));
const readCfg = (rel) => JSON.parse(readFileSync(path.join(ROOT, rel), 'utf8'));

// --- synthetic fixtures: minimal {velocity, swarm} pairs -------------------
const baseVelocity = {
  durable_plan: { enabled: true },
  code_review: { enabled: true, checkers: ['security', 'simplify', 'code-structure'] },
  design_judge: { enabled: false },
  sprint_mode: { enabled: false },
  power_mode: { enabled: false },
  notifier: { presence: 'always' },
};
const baseSwarm = { refuse_dirty_tree: false, isolation: 'worktree' };
const clone = (o) => JSON.parse(JSON.stringify(o));
const cfg = (velocity, swarm) => ({ velocity, swarm });

describe('template velocity/swarm parity', () => {
  it('test_when_live_and_template_velocity_swarm_then_parity_holds', () => {
    const live = readCfg('.claude/project.json');
    const template = readCfg('src/project.template.json');
    const { ok, drift } = checkConfigParity(live, template);
    assert.equal(ok, true,
      `live and template must agree outside the allowlist; first drift: ${drift}`);
  });

  it('test_when_template_read_then_code_review_present_and_enabled', () => {
    const template = readCfg('src/project.template.json');
    const cr = template.velocity && template.velocity.code_review;
    assert.ok(cr, 'template carries velocity.code_review');
    assert.equal(cr.enabled, true, 'template code_review enabled');
    assert.deepEqual(cr.checkers, ['security', 'simplify', 'code-structure'],
      'template code_review lists the three landing-blocking checkers');
  });

  it('test_when_template_read_then_design_judge_present_and_off', () => {
    const template = readCfg('src/project.template.json');
    const dj = template.velocity && template.velocity.design_judge;
    assert.ok(dj, 'template carries velocity.design_judge (present-and-explicit)');
    assert.equal(dj.enabled, false, 'template design_judge off (matches live)');
  });

  it('test_when_swarm_refuse_dirty_tree_differs_then_parity_fails', () => {
    const live = cfg(clone(baseVelocity), clone(baseSwarm));
    const template = cfg(clone(baseVelocity), { ...clone(baseSwarm), refuse_dirty_tree: true });
    const { ok, drift } = checkConfigParity(live, template);
    assert.equal(ok, false, 'a swarm.refuse_dirty_tree disagreement is caught');
    assert.match(drift, /swarm\.refuse_dirty_tree/, `drift names the offending path: ${drift}`);
  });

  it('test_when_only_allowlisted_key_differs_then_parity_holds', () => {
    const live = cfg({ ...clone(baseVelocity), power_mode: { enabled: true } }, clone(baseSwarm));
    const template = cfg(clone(baseVelocity), clone(baseSwarm));
    const { ok } = checkConfigParity(live, template);
    assert.equal(ok, true, 'velocity.power_mode.enabled is on the intentional-difference allowlist');
  });

  it('test_when_non_allowlisted_velocity_key_differs_then_parity_fails', () => {
    const live = cfg({ ...clone(baseVelocity), durable_plan: { enabled: false } }, clone(baseSwarm));
    const template = cfg(clone(baseVelocity), clone(baseSwarm));
    const { ok, drift } = checkConfigParity(live, template);
    assert.equal(ok, false, 'a non-allowlisted velocity drift is caught');
    assert.match(drift, /velocity\.durable_plan\.enabled/, `drift names the offending path: ${drift}`);
  });

  it('test_when_allowlist_exported_then_names_the_dogfood_keys', () => {
    const flat = CONFIG_PARITY_ALLOWLIST.map((p) => p.join('.'));
    assert.deepEqual(new Set(flat), new Set([
      'velocity.sprint_mode.enabled',
      'velocity.power_mode.enabled',
      'velocity.notifier.presence',
    ]), 'the allowlist is exactly the three intentional dogfood/consumer deviations');
  });
});
