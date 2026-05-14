// Text invariants on docs/runbooks/npm-publish.md. Covers AC-008 (Snyk-documented
// IOC paths must travel verbatim into the runbook) and AC-009 (future-CI invariants
// section must name SHA-pinning + cache-poisoning rules with citations).

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RUNBOOK = path.join(REPO_ROOT, 'docs/runbooks/npm-publish.md');

async function readRunbook() {
  return readFile(RUNBOOK, 'utf8');
}

describe('runbook — Pre-publish hygiene sweep (AC-008)', () => {
  it('test_when_read_runbook_then_names_snyk_dead_mans_switch_paths_verbatim', async () => {
    const text = await readRunbook();
    for (const p of [
      '~/.local/bin/gh-token-monitor.sh',
      '~/.config/systemd/user/gh-token-monitor.service',
      '~/Library/LaunchAgents/com.user.gh-token-monitor.plist',
    ]) {
      assert.ok(
        text.includes(p),
        `runbook must name the Snyk-documented dead-man's-switch path verbatim: ${p}`
      );
    }
  });

  it('test_when_read_runbook_then_contains_credential_grep_pattern_over_claude_projects', async () => {
    const text = await readRunbook();
    assert.match(
      text,
      /grep[^\n]*~\/\.claude\/projects\/\*\.jsonl/,
      'runbook must include a grep command pattern scanning ~/.claude/projects/*.jsonl'
    );
    for (const needle of ['sk-', 'ghp_', 'AKIA', 'xoxb-']) {
      assert.ok(
        text.includes(needle),
        `runbook hygiene-sweep grep must include the credential prefix substring: ${needle}`
      );
    }
  });

  it('test_when_read_runbook_then_names_npm_2fa_auth_and_writes_check', async () => {
    const text = await readRunbook();
    assert.match(
      text,
      /npm\s+profile\s+get\s+tfa/,
      'runbook must include `npm profile get tfa` as part of pre-publish hygiene'
    );
    assert.ok(
      text.includes('auth-and-writes'),
      'runbook must require the tfa setting to read "auth-and-writes" before publish'
    );
  });
});

describe('runbook — Future-CI invariants (AC-009)', () => {
  it('test_when_read_runbook_then_contains_sha_pinning_rule_with_tj_actions_cve', async () => {
    const text = await readRunbook();
    assert.ok(
      text.includes('40-character commit SHA'),
      'runbook must state the 40-character SHA pinning rule for third-party Actions'
    );
    assert.ok(
      text.includes('CVE-2025-30066'),
      'runbook must cite CVE-2025-30066 (tj-actions/changed-files) as the SHA-pinning rationale'
    );
  });

  it('test_when_read_runbook_then_contains_cache_poisoning_rule_with_slsa_quote', async () => {
    const text = await readRunbook();
    assert.match(
      text,
      /omit the (`?)cache:(`?) key|omit the key/i,
      'runbook must prescribe omitting the `cache:` key on setup-* actions (action rejects `cache: false`; omitting disables caching)'
    );
    assert.ok(
      text.includes('actions/cache'),
      'runbook must explicitly forbid actions/cache in release workflows'
    );
    assert.match(
      text,
      /SLSA/,
      'runbook must cite SLSA in the context of provenance attests build, not authorization'
    );
  });

  it('test_when_read_runbook_then_footnotes_harden_runner_evaluation_candidate', async () => {
    const text = await readRunbook();
    assert.ok(
      text.includes('step-security/harden-runner'),
      'runbook must footnote step-security/harden-runner as an egress-monitoring evaluation candidate'
    );
  });
});
