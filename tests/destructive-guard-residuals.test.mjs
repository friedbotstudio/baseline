// Club A — 7f2c destructive_cmd_guard residuals.
//
// The consent-path-write detection is lifted into common.mjs as the exported
// `writesConsentPath`, so it is unit-testable without running the guard's
// top-level payload read (the guard imports it).
//
// (MEDIUM) A redirect to a $VAR-indirected consent path evaded the literal
// `.claude/state/` prefix in CONSENT_REDIRECT_RE.
// (LOW) A read-only mention of a consent basename must not be blocked.
//
// RED until: writesConsentPath is exported from common.mjs and the redirect
// detection is broadened to the reserved consent basenames regardless of how
// the directory is spelled.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const COMMON = join(REPO_ROOT, '.claude/hooks/lib/common.mjs');

describe('7f2c MEDIUM — $VAR-indirected consent-path writes are blocked', () => {
  it('test_when_destructive_guard_var_indirected_consent_redirect_then_blocked', async () => {
    const { writesConsentPath } = await import(COMMON);
    // Directory spelled via a shell variable; basename is a reserved consent token.
    assert.equal(
      writesConsentPath('C=.claude/state\necho 123 > $C/commit_consent'),
      true,
      '$VAR-indirected redirect to commit_consent must be blocked'
    );
    assert.equal(
      writesConsentPath('echo 1 > ${HOME}/.commit_consent_grant'),
      true,
      '${VAR}-indirected redirect to a *_grant marker must be blocked'
    );
    // Sanity: the literal-path case still blocks (regression).
    assert.equal(
      writesConsentPath('echo 1 > .claude/state/commit_consent'),
      true,
      'literal consent-path redirect still blocked'
    );
  });
});

describe('7f2c LOW — read-only mentions of a consent basename are not blocked', () => {
  it('test_when_destructive_guard_consent_basename_read_then_not_blocked', async () => {
    const { writesConsentPath } = await import(COMMON);
    assert.equal(
      writesConsentPath('grep -r commit_consent .claude/'),
      false,
      'grep mentioning commit_consent (no write) must not be blocked'
    );
    assert.equal(
      writesConsentPath('cat .claude/state/commit_consent'),
      false,
      'reading a consent token must not be blocked'
    );
  });
});
