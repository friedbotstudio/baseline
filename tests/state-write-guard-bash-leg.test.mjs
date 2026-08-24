// T1 follow-up — state_write_guard covers the file-editing tools and not Bash.
//
// The hook is wired on Write|Edit|MultiEdit|NotebookEdit. The only Bash-leg write
// detector in the repo is `writesConsentPath`, scoped to basenames matching
// consent/approval/grant — and `.claude/state/workflow.json` matches none of them.
//
// So a subagent could still append a phase to `completed` with a shell redirect,
// which is the exact privilege path T1 set out to close. The hook raised the cost
// of the bypass rather than removing it.
//
// The detector is NOT rewritten here. `writesConsentPath` already carries variable
// expansion (`D=.claude/state; tee $D/workflow.json`), executed-fragment scanning,
// and target anchoring so a READ passes. Cloning that machinery for a second path
// family is the duplication this repo has a convention against; the family is
// parameterised instead.
//
// RED until: common.mjs exports writesWorkflowStatePath, decideStateWrite reads a
// Bash payload, and the hook is wired on Bash.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const COMMON = join(REPO_ROOT, '.claude/hooks/lib/common.mjs');
const STATE_WRITE = join(REPO_ROOT, '.claude/hooks/lib/state-write.mjs');

const bash = (command, extra = {}) => ({
  agent_id: 'a77f4ef750241df51',
  agent_type: 'general-purpose',
  tool_name: 'Bash',
  tool_input: { command },
  ...extra,
});

describe('AC-024 — a subagent Bash write to .claude/state/** is denied', () => {
  it('test_when_a_subagent_bash_writes_workflow_state_then_it_is_denied', async () => {
    const { decideStateWrite } = await import(STATE_WRITE);

    const writes = [
      'echo "{}" > .claude/state/workflow.json',
      'echo x >> .claude/state/harness_state',
      'tee .claude/state/workflow.json < /tmp/f',
      'cp /tmp/f .claude/state/workflow.json',
      'sed -i "" s/a/b/ .claude/state/workflow.json',
      'node -e "require(\'fs\').writeFileSync(\'.claude/state/workflow.json\',\'{}\')"',
    ];

    for (const command of writes) {
      const d = decideStateWrite(bash(command));
      assert.equal(d.allow, false, `a subagent must not write state via Bash: ${command}`);
      assert.match(String(d.reason ?? ''), /subagent/i, 'the denial must name why it fired');
    }
  });

  it('test_when_the_target_is_assembled_from_a_variable_then_it_is_still_denied', async () => {
    const { decideStateWrite } = await import(STATE_WRITE);

    // The detector this reuses already expands command-start assignments. A
    // literal-only scanner would miss this, which is why it is not rewritten.
    const d = decideStateWrite(bash('D=.claude/state; tee $D/workflow.json < /tmp/f'));
    assert.equal(d.allow, false, 'a variable-indirected state write must be denied');
  });

  it('test_when_a_subagent_only_reads_state_then_it_is_allowed', async () => {
    const { decideStateWrite } = await import(STATE_WRITE);

    // Target-anchored, like the consent detector: a read is not a write. A
    // subagent that cannot READ workflow.json cannot do its job at all.
    for (const command of [
      'cat .claude/state/workflow.json',
      'grep slug .claude/state/workflow.json',
      'head -1 .claude/state/last_test_result',
      'ls .claude/state/',
    ]) {
      assert.equal(decideStateWrite(bash(command)).allow, true, `a read must pass: ${command}`);
    }
  });

  it('test_when_the_main_session_bash_writes_state_then_it_is_allowed', async () => {
    const { decideStateWrite } = await import(STATE_WRITE);

    // The harness itself writes harness_state with a builtin redirect on every
    // loop iteration. Denying that would brick the workflow.
    const mainSession = { tool_name: 'Bash', tool_input: { command: 'echo x > .claude/state/harness_state' } };
    assert.equal(decideStateWrite(mainSession).allow, true, 'an absent agent_id reads as the main session');
  });

  it('test_when_a_subagent_bash_writes_outside_the_state_dir_then_it_is_allowed', async () => {
    const { decideStateWrite } = await import(STATE_WRITE);

    for (const command of ['echo x > src/feature.mjs', 'npm test', 'git status']) {
      assert.equal(decideStateWrite(bash(command)).allow, true, `unrelated command must pass: ${command}`);
    }
  });

  it('test_when_the_bash_payload_is_degenerate_then_it_allows_rather_than_throwing', async () => {
    const { decideStateWrite } = await import(STATE_WRITE);

    for (const p of [
      { tool_name: 'Bash', tool_input: null },
      { tool_name: 'Bash', tool_input: {} },
      { tool_name: 'Bash', tool_input: { command: null } },
      bash(''),
    ]) {
      assert.doesNotThrow(() => decideStateWrite(p));
      assert.equal(decideStateWrite(p).allow, true, 'an unreadable payload fails open');
    }
  });
});

describe('AC-024 seam — the path family is parameterised, not cloned', () => {
  it('test_when_common_exports_the_state_detector_then_it_shares_the_consent_machinery', async () => {
    const { writesWorkflowStatePath, writesConsentPath } = await import(COMMON);

    assert.equal(typeof writesWorkflowStatePath, 'function', 'the state-path detector is exported');
    assert.equal(writesWorkflowStatePath('echo x > .claude/state/workflow.json'), true);
    assert.equal(writesWorkflowStatePath('cat .claude/state/workflow.json'), false);

    // The consent detector must keep working unchanged — same machinery, other family.
    assert.equal(writesConsentPath('echo x > .claude/state/commit_consent'), true);
    assert.equal(writesConsentPath('cat .claude/state/commit_consent'), false);
  });

  it('test_when_the_hook_is_wired_then_bash_is_in_its_matcher', () => {
    const settings = JSON.parse(readFileSync(join(REPO_ROOT, '.claude/settings.json'), 'utf8'));
    const matchers = (settings.hooks.PreToolUse || [])
      .filter((g) => JSON.stringify(g).includes('state_write_guard'))
      .map((g) => g.matcher);

    assert.ok(matchers.length > 0, 'the hook is wired somewhere in PreToolUse');
    assert.ok(
      matchers.some((m) => /\bBash\b/.test(String(m))),
      `state_write_guard must also run on Bash; matchers seen: ${JSON.stringify(matchers)}`
    );
  });
});
