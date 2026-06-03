// Spec: anchor-consent-write-target — writesConsentPath blocks iff a write whose
// RESOLVED target is a consent path is present. Reads of a consent path (even
// alongside an unrelated write) are allowed; variable-indirected writes are
// resolved and blocked. Security invariant: every real-forge form BLOCKS; only
// genuine reads flip to ALLOW. RED on the read-allow cases until target-anchoring
// lands in .claude/hooks/lib/common.mjs.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const imp = () => import(join(REPO_ROOT, '.claude/hooks/lib/common.mjs'));
const W = async () => (await imp()).writesConsentPath;

describe('writesConsentPath — target-anchored consent-write detection', () => {
  // --- reads + unrelated writes must ALLOW (AC-001, AC-002, AC-003) ---
  it('test_when_read_then_unrelated_git_mv_then_allowed', async () => {
    assert.equal((await W())('head -1 .claude/state/commit_consent; git mv a b'), false);
  });
  it('test_when_read_and_unrelated_cp_then_allowed', async () => {
    assert.equal((await W())('cat .claude/state/commit_consent && cp x y'), false);
  });
  it('test_when_grep_consent_piped_tee_elsewhere_then_allowed', async () => {
    assert.equal((await W())('grep x .claude/state/commit_consent | tee /tmp/log'), false);
  });

  // --- variable-indirected writes must BLOCK (AC-004, AC-005, AC-006, AC-007) ---
  it('test_when_var_singlelevel_tee_then_blocked', async () => {
    assert.equal((await W())('F=.claude/state/commit_consent; tee $F'), true);
  });
  it('test_when_var_multilevel_tee_then_blocked', async () => {
    assert.equal((await W())('F=.claude/state/commit_consent; G=$F; tee $G'), true);
  });
  it('test_when_var_redirect_then_blocked', async () => {
    assert.equal((await W())('F=.claude/state/commit_consent; echo x > $F'), true);
  });
  it('test_when_dirvar_literal_basename_then_blocked', async () => {
    assert.equal((await W())('D=.claude/state; tee $D/commit_consent'), true);
  });

  // --- direct writes / redirect / prog / sed / dd must BLOCK
  //     (AC-008, AC-009, AC-010, AC-011, AC-012, AC-013, AC-014) ---
  it('test_when_direct_tee_then_blocked', async () => {
    assert.equal((await W())('tee .claude/state/commit_consent'), true);
  });
  it('test_when_cp_dest_then_blocked', async () => {
    assert.equal((await W())('cp /tmp/x .claude/state/.spec_approval_grant'), true);
  });
  it('test_when_mv_dest_then_blocked', async () => {
    assert.equal((await W())('mv /tmp/y .claude/state/.commit_consent_grant'), true);
  });
  it('test_when_redirect_then_blocked', async () => {
    assert.equal((await W())('echo x > .claude/state/commit_consent'), true);
  });
  it('test_when_progwrite_then_blocked', async () => {
    assert.equal((await W())(`node -e "require('fs').writeFileSync('.claude/state/push_consent','1')"`), true);
  });
  it('test_when_sed_inplace_then_blocked', async () => {
    assert.equal((await W())('sed -i s/a/b/ .claude/state/commit_consent'), true);
  });
  it('test_when_dd_of_then_blocked', async () => {
    assert.equal((await W())('dd if=/dev/null of=.claude/state/commit_consent'), true);
  });

  // --- wrappers peeled by executedFragments must BLOCK (AC-015) ---
  it('test_when_subshell_and_eval_wrappers_then_blocked', async () => {
    const w = await W();
    assert.equal(w('( tee .claude/state/commit_consent )'), true, 'subshell');
    assert.equal(w('eval "tee .claude/state/commit_consent"'), true, 'eval');
    assert.equal(w('sh -c "tee .claude/state/commit_consent"'), true, 'sh -c');
  });

  // --- git-commit carve-out retained (AC-016) ---
  it('test_when_commit_message_prose_vs_substitution', async () => {
    const w = await W();
    assert.equal(w('git commit -m "fix commit_consent via tee"'), false, 'prose allowed');
    assert.equal(w('git commit -m "$(tee .claude/state/commit_consent)"'), true, 'substitution blocked');
  });

  // --- conservative over-block: read-OUT of a consent path (AC-018) ---
  it('test_when_readout_cp_consent_to_tmp_then_blocked', async () => {
    assert.equal((await W())('cp .claude/state/commit_consent /tmp/backup'), true);
  });

  // --- boundary: degenerate + untraceable var (no literal consent) → false ---
  it('test_when_boundary_then_false_no_throw', async () => {
    const w = await W();
    assert.equal(w(null), false, 'null');
    assert.equal(w(''), false, 'empty');
    assert.equal(w('git commit'), false, 'bare commit');
    assert.equal(w('tee $UNKNOWN_LOG'), false, 'untraceable var, no literal consent → allow (out of scope)');
  });
});
