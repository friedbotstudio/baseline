// Verify every `uses: owner/repo@<sha> # vX.Y.Z` directive across
// .github/workflows/*.yml pins a 40-character commit SHA that resolves to
// the named version tag on the upstream action repository.
//
// Closes the SEC-MEDIUM "Action SHA authenticity is not verified by the test
// gate" finding from docs/archive/2026-05-13/release-workflow/security.md by
// exercising the canonical verifier at scripts/verify-action-shas.mjs.
//
// ONLINE-DEPENDENT — invokes `git ls-remote` against github.com once per
// unique (action, tag) pair (~7 calls for release.yml; ~1-2 seconds each on
// a warm DNS). Skipped by default so offline `npm test` runs stay fast.
// Opt-in: `VERIFY_ACTION_SHAS=1 npm test`, or set `VERIFY_ACTION_SHAS=1` in
// the release workflow before invoking the suite.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT = path.join(REPO_ROOT, 'scripts/verify-action-shas.mjs');

const shouldRun = process.env.VERIFY_ACTION_SHAS === '1';
const skipReason = shouldRun ? false : 'set VERIFY_ACTION_SHAS=1 to run (online-dependent)';

describe('action SHA authenticity (release-workflow SEC-MEDIUM closure)', { skip: skipReason }, () => {
  it('test_when_workflows_pin_third_party_actions_then_each_sha_matches_upstream_tag', () => {
    assert.ok(
      existsSync(SCRIPT),
      `scripts/verify-action-shas.mjs does not exist yet — implement worker must create it. Expected at: ${SCRIPT}`
    );
    const result = spawnSync('node', [SCRIPT], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      timeout: 120_000,
    });
    assert.equal(
      result.status,
      0,
      `verify-action-shas.mjs exited ${result.status}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`
    );
    assert.match(
      result.stdout,
      /\d+\/\d+ verified/,
      `expected verifier to print "<verified>/<total> verified" summary; got:\n${result.stdout}`
    );
  });
});
