// AC-009 (erp-portables slice I) — commit-planner + retrospective skills.
//
// Both skills exist with `owner: baseline`, generalized content (no erp
// references), manifest ownership + hashes, and the 46→48 skill count
// reconciled across every count-bearing governance surface. commit-planner's
// inventory.mjs is a pure, deterministic dirty-tree → single-concern-groups
// transformer.
//
// Run: node --test tests/skills-commit-planner-retrospective.test.mjs

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(REPO_ROOT, rel), 'utf8');

const NEW_SKILLS = ['commit-planner', 'retrospective'];

describe('skill dirs — owner: baseline, generalized (AC-009)', () => {
  for (const slug of NEW_SKILLS) {
    it(`test_when_skill_dirs_present_then_owner_baseline_and_generalized_${slug.replace(/[^\w]/g, '_')}`, () => {
      const rel = `.claude/skills/${slug}/SKILL.md`;
      assert.ok(existsSync(join(REPO_ROOT, rel)), `${rel} must exist (RED pre-/implement)`);
      const text = read(rel);
      assert.match(text, /^name:\s*\S+\nowner:\s*baseline\b/m,
        `${rel} declares owner: baseline directly after name: (Article XII.1)`);
      assert.doesNotMatch(text, /\berp\b/i,
        `${rel} is generalized — no erp references may survive the port`);
    });
  }
});

describe('manifest — ownership + hashes (AC-009)', () => {
  it('test_when_manifest_built_then_owners_skills_includes_both', () => {
    const manifest = JSON.parse(read('obj/template/.claude/manifest.json'));
    for (const slug of NEW_SKILLS) {
      assert.equal(manifest.owners.skills[slug], 'baseline',
        `manifest owners.skills must record ${slug} as baseline-owned`);
      const hashed = Object.keys(manifest.files)
        .filter((p) => p.startsWith(`.claude/skills/${slug}/`));
      assert.ok(hashed.length >= 1, `manifest.files must hash ${slug}'s files`);
    }
  });
});

describe('counts — 46→48 reconciled everywhere (AC-009)', () => {
  const COUNT_SURFACES = [
    'CLAUDE.md',
    'src/CLAUDE.template.md',
    'README.md',
    'docs/init/seed.md',
    'src/seed.template.md',
    '.claude/CONSTITUTION.md',
  ];
  for (const rel of COUNT_SURFACES) {
    it(`test_when_counts_reconciled_then_52_skills_in_${rel.replace(/[^\w]/g, '_')}`, () => {
      const text = read(rel);
      assert.ok(text.includes('52 skills'), `${rel} must read "52 skills"`);
      assert.ok(!text.includes('46 skills'), `${rel} must no longer read "46 skills"`);
    });
  }
});

describe('inventory.mjs — deterministic single-concern grouping (AC-009)', () => {
  const ENTRIES = [
    { path: 'docs/guide/setup.md', status: 'M' },
    { path: '.claude/hooks/sample_guard.mjs', status: 'M' },
    { path: 'tests/sample-guard.test.mjs', status: 'A' },
    { path: 'README.md', status: 'M' },
  ];

  it('test_when_inventory_run_then_deterministic_single_concern_groups', async () => {
    const { groupDirtyTree } = await import(
      join(REPO_ROOT, '.claude/skills/commit-planner/inventory.mjs')
    );

    const groups = groupDirtyTree(ENTRIES);
    assert.ok(Array.isArray(groups) && groups.length >= 2,
      'a mixed-concern tree splits into multiple groups');

    for (const g of groups) {
      assert.ok(typeof g.type === 'string' && g.type.length > 0,
        'every group carries a Conventional Commit type');
      assert.ok(Array.isArray(g.paths) && g.paths.length > 0,
        'every group carries at least one path');
    }

    const flat = groups.flatMap((g) => g.paths).sort();
    assert.deepEqual(flat, ENTRIES.map((e) => e.path).sort(),
      'every dirty path appears in exactly one group (partition)');

    const docsGroup = groups.find((g) => g.paths.includes('docs/guide/setup.md'));
    assert.equal(docsGroup.type, 'docs', 'a docs-only path lands in a docs-typed group');

    const hookGroup = groups.find((g) => g.paths.includes('.claude/hooks/sample_guard.mjs'));
    assert.ok(hookGroup.paths.includes('tests/sample-guard.test.mjs'),
      'a source file and its paired test land in the SAME single-concern group');

    const again = groupDirtyTree([...ENTRIES].reverse());
    assert.deepEqual(again, groups,
      'same input (any order) → identical output — deterministic, no fs/git calls');
  });
});
