// epic-close-bundle-archival — AC-001 (SOP documentation parity)
//
// The fold lives in skill SOP, not just the helper. The commit skill's
// epic-child path must document: flip the slice committed PRE-commit, invoke
// epic_close.mjs, and let the staged bundle move ride the same commit. The
// harness SOP must demote its post-commit flip to an idempotent backstop that
// defers to the commit skill, so the two skills do not both claim ownership.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { REPO_ROOT } from './helpers/epic-close-fixture.mjs';

const read = (rel) => fs.readFile(path.join(REPO_ROOT, rel), 'utf8');

describe('commit skill documents the epic-close fold (AC-001)', () => {
  it('test_when_commit_skill_md_inspected_then_epic_close_fold_documented', async () => {
    const md = await read('.claude/skills/commit/SKILL.md');
    assert.match(md, /epic_close\.mjs/, 'commit/SKILL.md names the epic_close.mjs helper');
    assert.match(md, /epic[- ]child/i, 'commit/SKILL.md describes the epic-child path');
    assert.match(md, /pre-commit|before .*commit/i, 'commit/SKILL.md documents the pre-commit slice flip');
  });
});

describe('harness SOP demotes the flip to an idempotent backstop (AC-001)', () => {
  it('test_when_harness_skill_md_inspected_then_backstop_documented', async () => {
    const md = await read('.claude/skills/harness/SKILL.md');
    assert.match(md, /backstop/i, 'harness/SKILL.md describes the post-commit flip as a backstop');
    assert.match(md, /idempotent/i, 'harness/SKILL.md marks the backstop idempotent');
  });
});
