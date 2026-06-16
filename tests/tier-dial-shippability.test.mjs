// tier-oracle-floor-dial — AC-007 shippability oracle.
//
// Makes the spec's "asserted by build/audit" criterion mechanical: the shipped
// manifest MUST include the accessor and MUST NOT include the dev-only oracle, and
// no new Python helper may enter a shipped skill. Turns "trust the build" into a
// falsifiable test (the v1 oracle-bound-checker thesis), so it catches a future
// build that forgets to ship .claude/hooks/lib/tier-dial.mjs.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, readFileSync } from 'node:fs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(REPO_ROOT, rel), 'utf8');

describe('AC-007 — shippability', () => {
  it('test_when_files_whitelist_then_scripts_dir_is_not_shipped', () => {
    // Structural, build-independent: scripts/ (home of the dev-only oracle) is not
    // in the npm `files` whitelist, so scripts/mutation-oracle.mjs cannot ship.
    const pkg = JSON.parse(read('package.json'));
    assert.ok(Array.isArray(pkg.files), 'package.json has a files whitelist');
    assert.ok(!pkg.files.some((f) => f === 'scripts/' || f.startsWith('scripts/')), 'scripts/ is not shipped');
    assert.ok(existsSync(join(REPO_ROOT, 'scripts/mutation-oracle.mjs')), 'oracle lives under the dev-only scripts/ prefix');
  });

  it('test_when_no_new_python_helper_in_shipped_skill', () => {
    // The accessor and the oracle change introduce no .py helper under a skill dir.
    assert.ok(!existsSync(join(REPO_ROOT, '.claude/hooks/lib/tier-dial.py')), 'accessor is .mjs, not .py');
  });

  it('test_when_manifest_built_then_ships_accessor_not_oracle', { skip: !existsSync(join(REPO_ROOT, 'obj/template/.claude/manifest.json')) ? 'obj/template not built — run npm run build' : false }, () => {
    const manifest = JSON.parse(read('obj/template/.claude/manifest.json'));
    const files = Object.keys(manifest.files || {});
    assert.ok(files.includes('.claude/hooks/lib/tier-dial.mjs'), 'shipped manifest includes the accessor (AC-007)');
    assert.ok(!files.some((f) => f.includes('mutation-oracle')), 'shipped manifest excludes the dev-only oracle (AC-007)');
  });
});
