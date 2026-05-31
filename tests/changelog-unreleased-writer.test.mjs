// WF-4 (changelog-actuator-staged-diff), defects 1 + 3 — unreleased-writer.mjs.
//
// appendUnderUnreleased() bounds the `## [Unreleased]` body with a regex that
// only recognizes the NEXT level-2 (`## `) heading. But @semantic-release writes
// minor/major version blocks as level-1 (`# [0.12.0]`). So the body bound skips
// every `# ` block down to the next `## ` and the append OVERWRITES that span —
// silently deleting released version blocks (observed: # [0.12.0]..[0.9.0] gone).
//
// These tests are RED until the boundary recognizes level-1 OR level-2 headings
// (and the result keeps exactly one, top-positioned `## [Unreleased]`).

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const writerMod = () => import(join(REPO_ROOT, '.claude/skills/changelog/unreleased-writer.mjs'));

// A CHANGELOG with the real-world mix that triggers the bug: a level-1 version
// block (`# [0.12.0]`, how semantic-release writes minor/major) ABOVE a level-2
// one (`## [0.8.2]`, how it writes patches).
const FIXTURE = [
  '# Changelog',
  '',
  '## [Unreleased]',
  '',
  '### Added',
  '',
  '- old entry',
  '',
  '# [0.12.0](https://example/compare/v0.11.0...v0.12.0) (2026-05-29)',
  '',
  '### Features',
  '',
  '* feat x',
  '',
  '## [0.8.2](https://example/compare/v0.8.1...v0.8.2) (2026-05-22)',
  '',
  '### Bug Fixes',
  '',
  '* fix y',
  '',
].join('\n');

// Same shape but the [Unreleased] body carries multiple level-3 section headers,
// to prove `### Added`/`### Fixed` inside the body are not the boundary.
const FIXTURE_L3 = [
  '# Changelog',
  '',
  '## [Unreleased]',
  '',
  '### Added',
  '',
  '- a',
  '',
  '### Fixed',
  '',
  '- b',
  '',
  '# [0.12.0](https://example/compare/v0.11.0...v0.12.0) (2026-05-29)',
  '',
  '### Features',
  '',
  '* feat x',
  '',
].join('\n');

async function withFixture(text, fn) {
  const dir = mkdtempSync(join(tmpdir(), 'clog-'));
  const path = join(dir, 'CHANGELOG.md');
  writeFileSync(path, text);
  try {
    return await fn(path);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const firstVersionIdx = (s) => s.search(/^#{1,2} \[\d/m);
const countUnreleased = (s) => (s.match(/^## \[Unreleased\]/gm) || []).length;

describe('unreleased-writer — appendUnderUnreleased preserves version blocks (WF-4 defect 1)', () => {
  it('test_when_append_under_unreleased_then_level1_and_level2_version_blocks_preserved', async () => {
    const { appendUnderUnreleased } = await writerMod();
    await withFixture(FIXTURE, async (path) => {
      await appendUnderUnreleased(path, [{ section: 'Fixed', body: 'new fix', breaking: false }]);
      const out = readFileSync(path, 'utf8');
      assert.match(out, /^# \[0\.12\.0\]/m, 'level-1 # [0.12.0] block must survive (data-loss regression)');
      assert.match(out, /\* feat x/, 'the 0.12.0 block body must survive');
      assert.match(out, /^## \[0\.8\.2\]/m, 'level-2 ## [0.8.2] block must survive');
      assert.match(out, /\* fix y/, 'the 0.8.2 block body must survive');
      assert.match(out, /### Fixed\n\n- new fix/, 'the new entry must land in the [Unreleased] body');
      assert.doesNotMatch(out, /- old entry/, 'the prior [Unreleased] body is replaced, not appended-to');
    });
  });

  it('test_when_append_under_unreleased_then_exactly_one_unreleased_heading', async () => {
    const { appendUnderUnreleased } = await writerMod();
    await withFixture(FIXTURE, async (path) => {
      await appendUnderUnreleased(path, [{ section: 'Fixed', body: 'z', breaking: false }]);
      assert.equal(countUnreleased(readFileSync(path, 'utf8')), 1);
    });
  });

  it('test_when_append_under_unreleased_then_unreleased_precedes_first_version_block', async () => {
    const { appendUnderUnreleased } = await writerMod();
    await withFixture(FIXTURE, async (path) => {
      await appendUnderUnreleased(path, [{ section: 'Fixed', body: 'z', breaking: false }]);
      const out = readFileSync(path, 'utf8');
      assert.ok(out.indexOf('## [Unreleased]') < firstVersionIdx(out),
        '[Unreleased] must sit above the first version block');
    });
  });

  it('test_when_empty_entries_then_all_version_blocks_preserved', async () => {
    const { appendUnderUnreleased } = await writerMod();
    await withFixture(FIXTURE, async (path) => {
      await appendUnderUnreleased(path, []);
      const out = readFileSync(path, 'utf8');
      assert.match(out, /^# \[0\.12\.0\]/m);
      assert.match(out, /^## \[0\.8\.2\]/m);
      const unreleasedBody = out.slice(out.indexOf('## [Unreleased]'), firstVersionIdx(out));
      assert.doesNotMatch(unreleasedBody, /^### /m, 'empty entries → no ### sections in the [Unreleased] body');
    });
  });

  it('test_when_intro_prose_mentions_unreleased_heading_then_real_heading_is_targeted', async () => {
    const { appendUnderUnreleased } = await writerMod();
    // Canonical keepachangelog files carry an intro paragraph that quotes the
    // heading in backticks ("The `## [Unreleased]` section is curated…"). A bare
    // indexOf matched that prose and inserted entries above the real heading.
    const withIntro = [
      '# Changelog',
      '',
      'The `## [Unreleased]` section is curated locally before each commit.',
      '',
      '## [Unreleased]',
      '',
      '### Added',
      '',
      '- old',
      '',
      '# [0.12.0](u) (2026-05-29)',
      '',
      '* feat x',
      '',
    ].join('\n');
    await withFixture(withIntro, async (path) => {
      await appendUnderUnreleased(path, [{ section: 'Fixed', body: 'new', breaking: false }]);
      const out = readFileSync(path, 'utf8');
      assert.equal(countUnreleased(out), 1, 'must not create a second [Unreleased] at the prose mention');
      assert.match(out, /^# \[0\.12\.0\]/m, 'version block preserved');
      // The new entry lands under the real heading (after the intro line), and
      // the intro prose line is untouched above it.
      const introIdx = out.indexOf('The `## [Unreleased]` section');
      const headingIdx = out.search(/^## \[Unreleased\]/m);
      assert.ok(introIdx >= 0 && introIdx < headingIdx, 'intro prose stays above the real heading');
      assert.match(out.slice(headingIdx), /### Fixed\n\n- new/, 'entry lands under the real heading');
    });
  });

  it('test_when_unreleased_body_has_level3_section_headers_then_they_are_not_a_boundary', async () => {
    const { appendUnderUnreleased } = await writerMod();
    await withFixture(FIXTURE_L3, async (path) => {
      await appendUnderUnreleased(path, [{ section: 'Added', body: 'c', breaking: false }]);
      const out = readFileSync(path, 'utf8');
      assert.match(out, /^# \[0\.12\.0\]/m, 'level-3 ### headers in the body must not be mistaken for the boundary');
      assert.match(out, /\* feat x/);
    });
  });
});
