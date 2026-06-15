// whatsnew cutover — governance counts after reclassification + rename (AC-005).
//
// changelog moves out of the `phases` category into a `generators` category, and
// the renamed skill is the one the manifest's owners.skills records as
// baseline-owned. The `standup` generator later joined this category, taking
// generators to 2 and the total skill count to 41.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const loadCounts = () => import(join(REPO_ROOT, '.claude/skills/audit-baseline/derive-counts.mjs'));

describe('whatsnew governance counts', () => {
  it('test_when_derive_counts_then_generators_two_phases_ten_sum_42', async () => {
    const { SKILL_CATEGORIES, deriveCounts } = await loadCounts();
    assert.equal(SKILL_CATEGORIES.generators, 2, 'generators category holds whatsnew + standup');
    assert.equal(SKILL_CATEGORIES.phases, 10, 'phases must drop from 11 to 10');

    const categorySum = Object.values(SKILL_CATEGORIES).reduce((a, b) => a + b, 0);
    const derived = deriveCounts(REPO_ROOT);
    assert.equal(categorySum, derived.skills, 'category sum must equal the derived skill total');
    assert.equal(derived.skills, 42, 'total skills is 42 after adding the gitignore setup skill');
  });

  // owners.skills is built by scanning skill dirs for `owner: baseline` frontmatter
  // (verified end-to-end by manifest.test.mjs / build-template.test.mjs). Asserting
  // that source of truth here is rebuild-free and parallel-safe — reading the live
  // obj/template manifest races the build-exercising tests that rm -rf + rebuild it.
  it('test_when_skill_renamed_then_whatsnew_is_baseline_owned_changelog_gone', () => {
    const whatsnewSkill = join(REPO_ROOT, '.claude/skills/whatsnew/SKILL.md');
    assert.equal(existsSync(whatsnewSkill), true, '.claude/skills/whatsnew/SKILL.md must exist');
    const fm = readFileSync(whatsnewSkill, 'utf8');
    assert.match(fm, /^owner:\s*baseline\s*$/m, 'whatsnew SKILL.md must declare owner: baseline (→ manifest owners.skills.whatsnew)');
    assert.equal(existsSync(join(REPO_ROOT, '.claude/skills/changelog')), false, 'changelog skill dir must be gone (→ dropped from owners.skills)');
  });
});
