// epic-close-bundle-archival — AC-007, AC-008
//
// Governance integrity for the epic-close fold. The mechanism adds no skill and
// no hook, so the baseline counts must stay 42 / 24, the constitution mirror
// must stay byte-equal, the seed §18.9 "deferred" sentence must be replaced by
// the actuated mechanism (with closed/closed_at in the schema block), and the
// track DAGs in workflows.jsonl must be untouched.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { REPO_ROOT } from './helpers/epic-close-fixture.mjs';

const read = (rel) => fs.readFile(path.join(REPO_ROOT, rel), 'utf8');

describe('epic-close governance — counts + mirror (AC-007)', () => {
  it('test_when_audit_baseline_runs_then_it_passes', () => {
    // audit-baseline is read-only; exit 0 == PASS. execFileSync throws on non-zero.
    execFileSync('node', ['.claude/skills/audit-baseline/audit.mjs'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    });
  });

  it('test_when_counts_derived_then_skills_42_and_hooks_24', async () => {
    const mod = await import(pathToFileURL(path.join(REPO_ROOT, '.claude/skills/audit-baseline/derive-counts.mjs')).href);
    const counts = mod.deriveCounts(REPO_ROOT);
    assert.equal(counts.skills, 42, 'skill count unchanged at 42 (epic-close adds no skill)');
    assert.equal(counts.hooks, 24, 'hook count unchanged at 24 (epic-close adds no hook)');
  });

  it('test_when_constitution_compared_then_claude_md_byte_equal_template', async () => {
    const live = await read('CLAUDE.md');
    const mirror = await read('src/CLAUDE.template.md');
    assert.equal(live, mirror, 'CLAUDE.md must stay byte-equal to src/CLAUDE.template.md');
  });
});

describe('epic-close governance — seed amendment + DAG stability (AC-008)', () => {
  it('test_when_seed_amended_then_deferred_sentence_gone', async () => {
    const seed = await read('docs/init/seed.md');
    assert.doesNotMatch(seed, /not actuated in this revision/i,
      'seed §18.9 must replace the "deferred; not actuated" sentence with the actuated mechanism');
  });

  it('test_when_seed_schema_inspected_then_closed_fields_present', async () => {
    const seed = await read('docs/init/seed.md');
    assert.match(seed, /"closed"/, 'epic-state schema block lists closed');
    assert.match(seed, /closed_at/, 'epic-state schema block lists closed_at');
  });

  it('test_when_seed_template_inspected_then_mirror_amended', async () => {
    const tpl = await read('src/seed.template.md');
    assert.doesNotMatch(tpl, /not actuated in this revision/i, 'seed.template mirror amended too');
    assert.match(tpl, /closed_at/, 'seed.template mirror carries closed_at');
  });

  it('test_when_workflows_jsonl_checked_then_unchanged_vs_head', () => {
    // No new track node: epic-close is folded into the existing commit node.
    execFileSync('git', ['diff', '--quiet', 'HEAD', '--', '.claude/workflows.jsonl'], {
      cwd: REPO_ROOT,
    });
  });
});
