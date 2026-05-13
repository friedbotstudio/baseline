import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT      = dirname(fileURLToPath(new URL('../package.json', import.meta.url)));
const TDD_SKILL = join(ROOT, '.claude/skills/tdd/SKILL.md');

describe('tdd skill — new design implementation step (AC-005)', () => {
  it('test_when_tdd_skill_md_then_describes_design_implementation_step', async () => {
    const text = await readFile(TDD_SKILL, 'utf8');
    assert.match(text, /design-ui/, 'tdd SKILL.md must mention design-ui');
    assert.match(
      text,
      /Step\s*[67]|after\s+verify|post[-\s]?verify|design implementation/i,
      'must place a new step (Step 6 / Step 7 / after verify / post-verify / design implementation)',
    );
  });

  it('test_when_tdd_skill_md_then_describes_ui_globs_gating', async () => {
    const text = await readFile(TDD_SKILL, 'utf8');
    assert.match(
      text,
      /ui_globs|tdd\.ui_globs/,
      'must reference ui_globs (the project.json field that gates the step)',
    );
  });

  it('test_when_tdd_skill_md_then_describes_one_invocation_per_design_call', async () => {
    const text = await readFile(TDD_SKILL, 'utf8');
    assert.match(text, /design_calls/, 'must mention the spec\'s design_calls section');
    assert.match(
      text,
      /for each|one[^.\n]*per[^.\n]*design_call|iterate|per row|each row/i,
      'must describe iteration over design_calls rows (one Skill(design-ui) per row)',
    );
  });

  it('test_when_tdd_skill_md_then_describes_re_verify_after_design_ui', async () => {
    const text = await readFile(TDD_SKILL, 'utf8');
    const designUiIdx = text.indexOf('design-ui');
    assert.ok(designUiIdx >= 0, 'must mention design-ui somewhere');
    const afterDesignUi = text.slice(designUiIdx);
    assert.match(
      afterDesignUi,
      /verify|re-verify|re-run/i,
      'must mention verify after design-ui (re-verify after the new step to confirm tests still pass)',
    );
  });
});
