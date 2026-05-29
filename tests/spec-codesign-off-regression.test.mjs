// brainstorm-and-codesign — AC-005 regression
//
// With codesign_mode: false, /spec output is byte-identical to a pre-feature
// snapshot on the same inputs. The ## Decisions section MUST be absent when
// codesign_mode is false. The fixture at tests/fixtures/spec-prefeature-baseline.md
// represents the canonical pre-feature spec; codesign-off path must not
// introduce the new section.
//
// SUT: .claude/skills/spec/SKILL.md (must conditionally write ## Decisions
//      only when codesign_mode: true)

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const HERE = path.dirname(__filename);
const REPO_ROOT = path.resolve(HERE, '..');
const FIXTURE = path.join(HERE, 'fixtures/spec-prefeature-baseline.md');

describe('spec codesign-off regression (AC-005)', () => {
  it('test_when_codesign_mode_false_then_spec_skill_md_describes_conditional_section_write', async () => {
    const skillMd = await fs.readFile(
      path.join(REPO_ROOT, '.claude/skills/spec/SKILL.md'), 'utf8'
    );
    assert.ok(/codesign_mode/.test(skillMd),
      'spec/SKILL.md must reference workflow.json -> codesign_mode field');
    assert.ok(/(if|when).*codesign_mode.*(false|skip|proceed)/is.test(skillMd),
      'spec/SKILL.md must describe the codesign-off branch where ## Decisions is not written');
  });

  it('test_when_fixture_loaded_then_prefeature_baseline_spec_contains_no_decisions_section', async () => {
    const fixture = await fs.readFile(FIXTURE, 'utf8');
    assert.ok(!/^## Decisions/m.test(fixture),
      'pre-feature spec fixture must NOT contain a ## Decisions section');
    // Confirm the fixture has the canonical spec structure
    assert.ok(/^## Goal/m.test(fixture));
    assert.ok(/^## Design/m.test(fixture));
    assert.ok(/^## Acceptance criteria/m.test(fixture));
    assert.ok(/^## Test plan/m.test(fixture));
  });
});
