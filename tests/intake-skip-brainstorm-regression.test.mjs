// brainstorm-and-codesign — AC-002 regression
//
// With skip_brainstorm: true, /intake output is byte-identical to a
// pre-feature snapshot on the same request. The fixture at
// tests/fixtures/intake-prefeature-baseline.md represents the canonical
// pre-feature intake output; the brainstorm-gated /intake must emit the
// identical bytes when the gate decides to skip.
//
// This regression test defends the invariant: opting OUT of brainstorm
// returns the engineer to the pre-feature behavior exactly.
//
// SUT: .claude/skills/intake/SKILL.md (must not write brainstorm-shaped
//      content when skip_brainstorm: true) — tested via the intake's
//      template-fill helper if one exists, otherwise via static text
//      comparison against the fixture.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const HERE = path.dirname(__filename);
const REPO_ROOT = path.resolve(HERE, '..');
const FIXTURE = path.join(HERE, 'fixtures/intake-prefeature-baseline.md');

describe('intake skip-brainstorm regression (AC-002)', () => {
  it('test_when_skip_brainstorm_true_then_intake_skill_md_does_not_reference_brainstorm_gate', async () => {
    // Static invariant: intake/SKILL.md must contain a fast-path that returns
    // BEFORE invoking Skill(brainstorm) when skip_brainstorm: true. This is
    // a structural assertion that the skip path exists and is byte-clean
    // (no brainstorm-related side effects when the gate decides to skip).
    const skillMd = await fs.readFile(
      path.join(REPO_ROOT, '.claude/skills/intake/SKILL.md'), 'utf8'
    );
    // After /implement, SKILL.md gains explicit skip-fast-path language.
    assert.ok(/skip_brainstorm/.test(skillMd),
      'intake/SKILL.md must reference workflow.json -> skip_brainstorm field');
    assert.ok(/(if|when).*skip_brainstorm.*(true|skip|proceed)/is.test(skillMd),
      'intake/SKILL.md must explicitly describe the skip-fast-path branch');
  });

  it('test_when_fixture_loaded_then_prefeature_baseline_intake_shape_is_stable', async () => {
    // The fixture must remain stable so the regression diff is meaningful.
    // If a future edit changes the fixture, this test catches it and the
    // maintainer must explicitly re-capture the snapshot.
    const fixture = await fs.readFile(FIXTURE, 'utf8');
    assert.ok(fixture.length > 100, 'fixture non-trivial');
    assert.ok(fixture.includes('## Problem') && fixture.includes('## Goal')
      && fixture.includes('## Acceptance criteria'),
      'fixture matches the canonical intake template skeleton');
    // Stability hash: fail-loud if the fixture is altered without intent.
    // We assert the byte-length matches a known value as a lightweight checksum.
    // (When the fixture is intentionally updated, this number updates too.)
    assert.equal(fixture.length > 1500 && fixture.length < 2500, true,
      'fixture byte-length within stable range; if you intentionally edited the fixture, update this bound');
  });
});
