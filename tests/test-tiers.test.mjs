// AC-001 / AC-008: the two-group split. The heavy install/publish tests
// (publish-check, smoke-tarball) move behind a PUBLISH_TESTS gate (mirroring the
// existing PLANTUML_TESTS gate), so a default run skips them and PUBLISH_TESTS=1
// runs them. No test file is deleted — coverage is preserved across the tiers.
//
// RED until the gate is added to those two files.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const TESTS_DIR = dirname(fileURLToPath(import.meta.url));
// The heavy npm-pack/install behavior lives in publish-check.test.mjs (the
// smoke-tarball *behavior* tests are part of that unified suite; the separate
// smoke-tarball.test.mjs is only a lightweight script-existence trap and needs
// no gate). publish-check.test.mjs is the file whose npm-pack writers + install
// flows must be gated to the on-demand tier.
const GATED = ['publish-check.test.mjs'];
const GATE = /process\.env\.PUBLISH_TESTS/;
const BASELINE_COUNT = 139;

describe('publish/pack heavy tier is PUBLISH_TESTS-gated', () => {
  for (const name of GATED) {
    it(`test_when_${name.replace(/[.-]/g, '_')}_then_declares_publish_tests_gate`, () => {
      const text = readFileSync(join(TESTS_DIR, name), 'utf8');
      assert.match(
        text,
        GATE,
        `${name} must gate its expensive cases behind process.env.PUBLISH_TESTS (default run skips them)`,
      );
    });
  }

  it('test_when_all_tiers_enumerated_then_no_test_file_deleted', () => {
    const count = readdirSync(TESTS_DIR).filter((n) => n.endsWith('.test.mjs')).length;
    assert.ok(
      count >= BASELINE_COUNT,
      `test file count (${count}) must not drop below the ${BASELINE_COUNT} baseline — coverage non-goal`,
    );
  });
});
