// Regression guard: src/cli/install.js → NEVER_TOUCH and
// scripts/build-manifest.mjs → NEVER_TOUCH_PATHS must contain the same paths.
//
// These two constants are the runtime check (merge.js consults install.js's
// list) and the build-time tier overlay (manifest declares NEVER_TOUCH for
// those paths). Drift between them means merge short-circuits a path the
// manifest still claims is MECHANICAL / SEMANTIC / etc., or vice versa.
//
// Spec AC-008. See docs/specs/upgrade-no-replay-prompts.md §Behavior #7.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');

const { NEVER_TOUCH } = await import('../src/cli/install.js');

function extractNeverTouchPathsFromBuildScript(src) {
  // Match: const NEVER_TOUCH_PATHS = new Set([ ... ]);
  // Body may span multiple lines with single-quoted strings.
  const match = src.match(/const\s+NEVER_TOUCH_PATHS\s*=\s*new\s+Set\s*\(\s*\[\s*([\s\S]*?)\s*\]\s*\)\s*;/);
  if (!match) {
    throw new Error(
      "could not locate `const NEVER_TOUCH_PATHS = new Set([...])` in scripts/build-manifest.mjs",
    );
  }
  const body = match[1];
  const paths = [];
  const re = /['"]([^'"]+)['"]/g;
  let m;
  while ((m = re.exec(body)) !== null) {
    paths.push(m[1]);
  }
  return paths;
}

describe('NEVER_TOUCH list sync between install.js and build-manifest.mjs', () => {
  it('test_when_install_NEVER_TOUCH_and_build_NEVER_TOUCH_PATHS_compared_then_sets_equal', async () => {
    const buildSrc = await readFile(resolve(repoRoot, 'scripts/build-manifest.mjs'), 'utf8');
    const buildPaths = extractNeverTouchPathsFromBuildScript(buildSrc);

    const installSorted = [...NEVER_TOUCH].sort();
    const buildSorted = [...buildPaths].sort();

    assert.deepEqual(
      installSorted,
      buildSorted,
      `install.js NEVER_TOUCH (${installSorted.length} paths) and ` +
      `build-manifest.mjs NEVER_TOUCH_PATHS (${buildSorted.length} paths) must be equal.\n` +
      `install only: ${installSorted.filter((p) => !buildSorted.includes(p)).join(', ') || '(none)'}\n` +
      `build only:   ${buildSorted.filter((p) => !installSorted.includes(p)).join(', ') || '(none)'}`,
    );
  });

  it('test_when_NEVER_TOUCH_sync_then_includes_runtime_state_files', async () => {
    // Explicit guard that the spec's two new entries actually landed in both
    // lists (regression trap against future accidental removal).
    assert.ok(
      NEVER_TOUCH.includes('.claude/memory/_pending.md'),
      'install.js NEVER_TOUCH must include .claude/memory/_pending.md per spec AC-007',
    );
    assert.ok(
      NEVER_TOUCH.includes('.claude/memory/_resume.md'),
      'install.js NEVER_TOUCH must include .claude/memory/_resume.md per spec AC-007',
    );

    const buildSrc = await readFile(resolve(repoRoot, 'scripts/build-manifest.mjs'), 'utf8');
    const buildPaths = extractNeverTouchPathsFromBuildScript(buildSrc);
    assert.ok(
      buildPaths.includes('.claude/memory/_pending.md'),
      'build-manifest.mjs NEVER_TOUCH_PATHS must include .claude/memory/_pending.md',
    );
    assert.ok(
      buildPaths.includes('.claude/memory/_resume.md'),
      'build-manifest.mjs NEVER_TOUCH_PATHS must include .claude/memory/_resume.md',
    );
  });
});
