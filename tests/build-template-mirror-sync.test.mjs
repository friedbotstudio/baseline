// scripts/build-template.sh Stage 0b — sync vendored mirrors.
//
// Structural check that the build script's NEW Stage 0b block syncs the five
// canonical sources from src/cli/ into the two consuming skill directories
// before Stage 1's recursive copy. Without Stage 0b, the byte-equality test
// (tests/vendored-mirror-bytes.test.mjs) becomes the maintainer's only drift
// signal; with it, the build itself self-heals the mirrors.
//
// We intentionally do NOT spawn the build script with mutated mirrors and
// observe the recovery: that creates race conditions with parallel test files
// (node:test runs files concurrently by default, and other tests read the
// mirror bytes). Structural assertions on the script text catch the same
// failure modes without working-tree side effects.
//
// Tests are RED until /implement adds Stage 0b to scripts/build-template.sh.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(here, '..');
const BUILD_SH = resolve(REPO_ROOT, 'scripts/build-template.sh');

const EXPECTED_MIRROR_PAIRS = [
  ['src/cli/workflows-validator.js', '.claude/skills/triage/workflows-validator.js'],
  ['src/cli/workflows-validator-invariants.js', '.claude/skills/triage/workflows-validator-invariants.js'],
  ['src/cli/workflows-validator-predicates.js', '.claude/skills/triage/workflows-validator-predicates.js'],
  ['src/cli/track-tasklist-materializer.js', '.claude/skills/triage/track-tasklist-materializer.js'],
  ['src/cli/workflow-migrator.js', '.claude/skills/harness/workflow-migrator.js'],
];

function lineOfFirstMatch(text, re) {
  const idx = text.search(re);
  if (idx === -1) return -1;
  return text.slice(0, idx).split('\n').length;
}

describe('scripts/build-template.sh — Stage 0b vendored mirror sync (structural)', () => {
  it('test_when_build_template_sh_scanned_then_stage_0b_block_present_before_stage_1', async () => {
    const text = await readFile(BUILD_SH, 'utf8');
    const lineStage0b = lineOfFirstMatch(text, /^#\s*Stage\s*0b[\s—:.-]/m);
    const lineStage1 = lineOfFirstMatch(text, /^#\s*Stage\s*1[\s—:.-]/m);
    assert.ok(
      lineStage0b > 0,
      'scripts/build-template.sh must contain a `# Stage 0b ...` block (vendored mirror sync).',
    );
    assert.ok(
      lineStage1 > 0,
      'scripts/build-template.sh must contain a `# Stage 1 ...` block (bulk copy).',
    );
    assert.ok(
      lineStage0b < lineStage1,
      `Stage 0b (line ${lineStage0b}) must come BEFORE Stage 1 (line ${lineStage1}); ` +
        `the recursive copy depends on the mirrors already being in place.`,
    );
  });

  for (const [canonical, mirror] of EXPECTED_MIRROR_PAIRS) {
    const safeName = mirror.replace(/[^\w]/g, '_');
    it(`test_when_build_template_sh_scanned_then_stage_0b_references_${safeName}`, async () => {
      const text = await readFile(BUILD_SH, 'utf8');
      assert.ok(
        text.includes(canonical),
        `scripts/build-template.sh must reference the canonical source path "${canonical}" inside Stage 0b.`,
      );
      assert.ok(
        text.includes(mirror),
        `scripts/build-template.sh must reference the mirror destination path "${mirror}" inside Stage 0b.`,
      );
    });
  }
});
