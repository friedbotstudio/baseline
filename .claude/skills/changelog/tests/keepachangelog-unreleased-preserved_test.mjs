// Integration test for AC-013: @semantic-release/changelog 6.0.3 SHALL
// preserve the "## [Unreleased]" heading at the top of CHANGELOG.md when it
// prepends a new versioned release block during the prepare step.
//
// Resolves the verification gap flagged in the spec: context7 did not
// document this seam, so this test answers the question empirically.
//
// Pre-implement RED note: this test imports @semantic-release/changelog
// (installed as a devDep at package.json:48) and the production actuator at
// .claude/skills/changelog/unreleased-writer.mjs. Until the actuator exists,
// the test errors on the import — the correct TDD failure mode.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const FIXTURE_CHANGELOG = `# Changelog

## [Unreleased]

### Added
- A draft entry the local changelog skill inserted

## [0.1.0] - 2026-01-01

### Added
- Initial release
`;

async function setupFixture() {
  const dir = await mkdtemp(join(tmpdir(), 'changelog-fixture-'));
  await writeFile(join(dir, 'CHANGELOG.md'), FIXTURE_CHANGELOG, 'utf8');
  return dir;
}

async function cleanup(dir) {
  await rm(dir, { recursive: true, force: true });
}

// Load the plugin. The plugin exports `verifyConditions` and `prepare` as
// named exports (ESM) or as properties on a CommonJS default (legacy). Try
// the modern shape first and fall back.
async function loadPlugin() {
  try {
    const mod = await import('@semantic-release/changelog');
    if (typeof mod.prepare === 'function') return mod;
    if (mod.default && typeof mod.default.prepare === 'function') return mod.default;
    throw new Error('@semantic-release/changelog does not expose a prepare function in the expected shape');
  } catch (err) {
    throw new Error(`failed to load @semantic-release/changelog: ${err.message}`);
  }
}

// A no-op logger that satisfies semantic-release's expected shape.
const noopLogger = {
  log: () => {},
  warn: () => {},
  error: () => {},
  success: () => {},
};

test('AC-013: @semantic-release/changelog prepare leaves ## [Unreleased] in file but displaces it (motivates the fallback hook)', async () => {
  // Empirical documentation test: confirms two facts about
  // @semantic-release/changelog 6.0.3 prepare-step behavior:
  //   (1) it does NOT delete the ## [Unreleased] heading — the heading
  //       survives in the file body, so a fallback can find it.
  //   (2) it does NOT preserve top-of-file position — the plugin prepends
  //       `nextRelease.notes` ABOVE the existing # Changelog + ## [Unreleased]
  //       headings, displacing them downward.
  // Together (1) + (2) motivate the second test in this file, which exercises
  // the unreleased-writer.mjs `reinsertUnreleasedHeading` fallback that lifts
  // the heading back to canonical top position.
  const dir = await setupFixture();
  try {
    const plugin = await loadPlugin();
    const context = {
      cwd: dir,
      env: { ...process.env },
      branch: { name: 'main' },
      lastRelease: { version: '0.1.0', gitTag: 'v0.1.0' },
      nextRelease: {
        type: 'minor',
        version: '0.2.0',
        gitTag: 'v0.2.0',
        // Full release-notes payload as semantic-release's
        // release-notes-generator would produce upstream of the changelog
        // plugin: version heading + body.
        notes: '## [0.2.0] - 2026-05-18\n\n### Added\n\n- A new feature shipped by the release pipeline',
      },
      logger: noopLogger,
    };
    await plugin.prepare({ changelogFile: 'CHANGELOG.md' }, context);
    const after = await readFile(join(dir, 'CHANGELOG.md'), 'utf8');
    // Fact (1): ## [Unreleased] heading survives somewhere in the file.
    assert.ok(
      after.includes('## [Unreleased]'),
      `## [Unreleased] heading must survive in file (plugin must not delete it); got:\n${after}`,
    );
    // Fact (1, cont.): the new versioned block is in the file.
    assert.ok(
      after.includes('0.2.0'),
      `CHANGELOG.md must contain new release version 0.2.0 after prepare; got:\n${after}`,
    );
    // Fact (2): the plugin prepends ABOVE the existing headings, so the
    // 0.2.0 block ends up BEFORE the ## [Unreleased] heading. This is the
    // exact behavior that motivates the fallback hook.
    const unreleasedIdx = after.indexOf('## [Unreleased]');
    const newReleaseIdx = after.indexOf('## [0.2.0]');
    assert.ok(
      newReleaseIdx >= 0 && unreleasedIdx > newReleaseIdx,
      `plugin behavior contract: 0.2.0 block prepended ABOVE ## [Unreleased]; ` +
        `expected 0.2.0@N < unreleased@M; got 0.2.0@${newReleaseIdx}, unreleased@${unreleasedIdx}; full:\n${after}`,
    );
  } finally {
    await cleanup(dir);
  }
});

test('AC-013 fallback: when prepare destroys Unreleased, our re-insertion path exists', async () => {
  // If the plugin DOES strip the heading, our post-prepare hook re-inserts it.
  // The hook is at .claude/skills/changelog/unreleased-writer.mjs and exports
  // a reinsertUnreleasedHeading(changelogPath) function. Until implement
  // lands, this import errors — the correct RED state.
  const { reinsertUnreleasedHeading } = await import(
    new URL('../unreleased-writer.mjs', import.meta.url).href
  );
  const dir = await setupFixture();
  try {
    // Synthesize the "plugin destroyed Unreleased" state by removing it.
    const broken = FIXTURE_CHANGELOG.replace(/## \[Unreleased\][\s\S]*?(?=## \[)/, '');
    await writeFile(join(dir, 'CHANGELOG.md'), broken, 'utf8');
    await reinsertUnreleasedHeading(join(dir, 'CHANGELOG.md'));
    const after = await readFile(join(dir, 'CHANGELOG.md'), 'utf8');
    assert.ok(
      after.includes('## [Unreleased]'),
      `reinsertUnreleasedHeading must restore the ## [Unreleased] heading; got:\n${after}`,
    );
    // The Unreleased heading must be the FIRST ## heading in the file.
    const firstH2 = after.match(/^## .+$/m);
    assert.ok(
      firstH2 && firstH2[0].includes('[Unreleased]'),
      `first ## heading must be [Unreleased]; got: ${firstH2 ? firstH2[0] : '(none)'}`,
    );
  } finally {
    await cleanup(dir);
  }
});
