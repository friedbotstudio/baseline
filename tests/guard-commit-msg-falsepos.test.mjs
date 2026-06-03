// Spec: guard-commit-msg-falsepos — writesConsentPath must ignore a git-commit
// MESSAGE payload (an inline -m/--message arg, or a heredoc body feeding the
// commit) when scanning for consent-path writes, while still blocking real Bash
// writes to consent paths — including a real write in a compound command next to
// a git commit. RED for AC-001/002/003 until sanitizeGitCommitForScan lands in
// .claude/hooks/lib/common.mjs; AC-004..007 + boundary defend existing behavior.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const imp = () => import(join(REPO_ROOT, '.claude/hooks/lib/common.mjs'));

describe('writesConsentPath — git-commit message payload carve-out', () => {
  // --- allowed: the message merely DESCRIBES consent tokens (AC-001..003) ---

  it('test_when_commit_dash_m_message_has_consent_words_then_not_blocked', async () => {
    const { writesConsentPath } = await imp();
    const cmd = 'git commit -m "fix(gates): write commit_consent via Write tool; drop Bash tee"';
    assert.equal(writesConsentPath(cmd), false, 'AC-001: -m message describing consent tokens must be allowed');
  });

  it('test_when_commit_heredoc_body_has_consent_words_then_not_blocked', async () => {
    const { writesConsentPath } = await imp();
    const cmd = [
      "git commit -F - <<'EOF'",
      'fix: the commit_consent / push_consent tokens',
      'note: never write them via tee or cp',
      'EOF',
    ].join('\n');
    assert.equal(writesConsentPath(cmd), false, 'AC-002: heredoc commit body describing consent tokens must be allowed');
  });

  it('test_when_commit_long_message_flag_then_not_blocked', async () => {
    const { writesConsentPath } = await imp();
    const cmd = 'git commit --message="touches push_consent; would use cp but does not"';
    assert.equal(writesConsentPath(cmd), false, 'AC-003: --message= form describing consent tokens must be allowed');
  });

  // --- still blocked: a REAL consent write, even alongside a commit (AC-004..005) ---

  it('test_when_consent_write_after_semicolon_following_commit_then_blocked', async () => {
    const { writesConsentPath } = await imp();
    const cmd = 'git commit -m x; tee .claude/state/commit_consent';
    assert.equal(writesConsentPath(cmd), true, 'AC-004: real tee to a consent path after ; must still be blocked');
  });

  it('test_when_consent_redirect_after_and_following_commit_then_blocked', async () => {
    const { writesConsentPath } = await imp();
    const cmd = 'git commit -m x && echo y > .claude/state/push_consent';
    assert.equal(writesConsentPath(cmd), true, 'AC-005: real redirect to a consent path after && must still be blocked');
  });

  // --- unchanged behavior: plain writes with no git commit (AC-006..007) ---

  it('test_when_plain_redirect_to_consent_then_blocked', async () => {
    const { writesConsentPath } = await imp();
    assert.equal(writesConsentPath('echo x > .claude/state/commit_consent'), true, 'AC-006: plain redirect unchanged');
  });

  it('test_when_tee_to_grant_marker_then_blocked', async () => {
    const { writesConsentPath } = await imp();
    assert.equal(writesConsentPath('tee .claude/state/.commit_consent_grant < /dev/null'), true, 'AC-007: grant-marker write unchanged');
  });

  // --- security: a REAL write hidden in a commit-message command substitution
  //     must NOT be stripped away (guard-bypass regression — HIGH finding). ---

  it('test_when_consent_write_in_dash_m_substitution_then_blocked', async () => {
    const { writesConsentPath } = await imp();
    const cmd = 'git commit -m "$(tee .claude/state/commit_consent)"';
    assert.equal(writesConsentPath(cmd), true, 'SEC: $() write in -m must still be blocked');
  });

  it('test_when_consent_write_in_dash_m_backticks_then_blocked', async () => {
    const { writesConsentPath } = await imp();
    const cmd = 'git commit -m "`date +%s > .claude/state/commit_consent`"';
    assert.equal(writesConsentPath(cmd), true, 'SEC: backtick write in -m must still be blocked');
  });

  it('test_when_consent_write_in_long_message_substitution_then_blocked', async () => {
    const { writesConsentPath } = await imp();
    const cmd = 'git commit --message="$(echo 1 > .claude/state/push_consent)"';
    assert.equal(writesConsentPath(cmd), true, 'SEC: $() write in --message= must still be blocked');
  });

  it('test_when_consent_write_in_heredoc_substitution_then_blocked', async () => {
    const { writesConsentPath } = await imp();
    const cmd = ['git commit -F - <<EOF', '$(tee .claude/state/commit_consent)', 'EOF'].join('\n');
    assert.equal(writesConsentPath(cmd), true, 'SEC: $() write in an (unquoted) heredoc body must still be blocked');
  });

  it('test_when_unterminated_heredoc_does_not_swallow_trailing_write_then_blocked', async () => {
    const { writesConsentPath } = await imp();
    // No closing EOF; a real write follows. The heredoc strip must not swallow it.
    const cmd = ['git commit -F - <<EOF', 'message body', 'tee .claude/state/commit_consent'].join('\n');
    assert.equal(writesConsentPath(cmd), true, 'SEC-MEDIUM: unterminated heredoc must not hide a trailing consent write');
  });

  // --- boundary: degenerate inputs return false without throwing ---

  it('test_when_nonstring_or_empty_or_bare_commit_then_false_no_throw', async () => {
    const { writesConsentPath } = await imp();
    assert.equal(writesConsentPath(null), false, 'null → false');
    assert.equal(writesConsentPath(''), false, 'empty → false');
    assert.equal(writesConsentPath('git commit'), false, 'bare git commit → false');
  });
});
