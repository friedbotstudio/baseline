// whatsnew cutover — CHANGELOG.md becomes semantic-release-only; the changelog
// skill is renamed whatsnew and the ## [Unreleased] curation machinery is gone
// (AC-003, AC-005).
//
// RED until the rename + helper removal + CHANGELOG.md cleanup land.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const r = (p) => join(REPO_ROOT, p);

function walkFiles(dir) {
  const out = [];
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, ent.name);
    if (ent.isDirectory()) out.push(...walkFiles(full));
    else out.push(full);
  }
  return out;
}

describe('whatsnew cutover', () => {
  it('test_when_tree_inspected_then_no_unreleased_curation', () => {
    const changelog = readFileSync(r('CHANGELOG.md'), 'utf8');
    assert.equal(changelog.includes('## [Unreleased]'), false, 'CHANGELOG.md must have no ## [Unreleased] section');

    const goneFiles = [
      '.claude/skills/changelog/unreleased-writer.mjs',
      '.claude/skills/changelog/version-preview.mjs',
      '.claude/skills/whatsnew/unreleased-writer.mjs',
      '.claude/skills/whatsnew/version-preview.mjs',
      '.claude/skills/changelog/tests/keepachangelog-unreleased-preserved_test.mjs',
      '.claude/skills/whatsnew/tests/keepachangelog-unreleased-preserved_test.mjs',
    ];
    for (const f of goneFiles) {
      assert.equal(existsSync(r(f)), false, `${f} must be removed`);
    }

    const skillDir = r('.claude/skills/whatsnew');
    if (existsSync(skillDir)) {
      for (const file of walkFiles(skillDir)) {
        const src = readFileSync(file, 'utf8');
        assert.equal(src.includes('appendUnderUnreleased'), false, `${file} must not reference appendUnderUnreleased`);
        assert.equal(src.includes('reinsertUnreleasedHeading'), false, `${file} must not reference reinsertUnreleasedHeading`);
      }
    }
  });

  it('test_when_skill_renamed_then_whatsnew_present_changelog_absent', () => {
    const skillMd = r('.claude/skills/whatsnew/SKILL.md');
    assert.equal(existsSync(skillMd), true, '.claude/skills/whatsnew/SKILL.md must exist');
    assert.match(readFileSync(skillMd, 'utf8'), /^name:\s*whatsnew\s*$/m, "SKILL.md frontmatter must declare name: whatsnew");
    assert.equal(existsSync(r('.claude/skills/changelog')), false, '.claude/skills/changelog/ must not exist after rename');
  });
});
