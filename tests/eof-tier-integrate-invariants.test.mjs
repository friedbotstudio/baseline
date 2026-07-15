import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

// Step 5/6/8 — tier-dial (design-judge + opt-out defaults), integrate wiring,
// and the Article II invariants (one maker/one checker; no new subagent).

const ROOT = dirname(fileURLToPath(new URL('../package.json', import.meta.url)));
const TIER = pathToFileURL(join(ROOT, '.claude/hooks/lib/tier-dial.mjs')).href;
const MAKER = pathToFileURL(join(ROOT, '.claude/skills/harness/maker-checker.mjs')).href;

describe('tier-dial — design-judge + blocking-by-default (AC-004/008)', () => {
  it('test_when_tier_dial_read_then_design_judge_in_canonical', async () => {
    const m = await import(TIER);
    assert.ok(m.CANONICAL_CHECKERS.includes('design-judge'), "'design-judge' is a canonical checker");
  });

  it('test_when_new_checkers_resolved_then_mandatory_true_by_default_optout', async () => {
    const m = await import(TIER);
    // regulated is this repo's tier; the new checkers default mandatory=true (D8 opt-out)
    for (const checker of ['security', 'review', 'code-structure', 'design-judge']) {
      const t = m.resolveCheckerThreshold(checker, { projectJson: { tier: { level: 'regulated' } } });
      assert.equal(t.mandatory, true, `${checker} defaults mandatory=true (blocking by default)`);
    }
  });

  it('test_when_optout_override_then_checker_advisory', async () => {
    const m = await import(TIER);
    const t = m.resolveCheckerThreshold('code-structure', {
      projectJson: { tier: { level: 'regulated', overrides: { 'code-structure': { mandatory: false } } } },
    });
    assert.equal(t.mandatory, false, 'a project opts a checker OUT via tier.overrides');
  });
});

describe('integrate — code-review fan-out wiring (AC-002)', () => {
  it('test_when_integrate_skill_read_then_declares_code_review_fanout', async () => {
    const skill = await readFile(join(ROOT, '.claude/skills/integrate/SKILL.md'), 'utf8');
    assert.match(skill, /code-review/i, 'integrate declares the code-review fan-out step (D8a)');
    assert.match(skill, /checker-fanout-code/, 'integrate names the parallel projection path');
  });
});

describe('Article II invariants hold (AC-008)', () => {
  it('test_when_framework_lands_then_assertBounded_still_one_maker_one_checker', async () => {
    const m = await import(MAKER);
    assert.throws(() => m.assertBounded({ makers: 2, checkers: 1 }), 'assertBounded rejects >1 maker');
    assert.throws(() => m.assertBounded({ makers: 1, checkers: 2 }), 'assertBounded rejects >1 checker');
    assert.doesNotThrow(() => m.assertBounded({ makers: 1, checkers: 1 }), 'one maker / one checker is allowed');
  });
});
