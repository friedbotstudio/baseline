// T1 — nothing stops a subagent writing .claude/state/**.
//
// Article II says decisions live in main context, but no hook enforces it:
// grep finds no agent_id/agent_type/subagent reference anywhere in .claude/hooks/.
// Six hooks READ workflow.json; none guards a write to it. A subagent appending
// a phase to `completed` widens what track_guard authorizes next — a privilege
// path bounded only by the consent gates.
//
// FEASIBILITY, CONFIRMED ON THIS MACHINE (not from documentation): a temporary
// PreToolUse probe wired through the gitignored .claude/settings.local.json
// captured three Bash payloads. Two from the main session carried NEITHER
// agent_id NOR agent_type as keys. One from a general-purpose subagent carried
// agent_id="a77f4ef750241df51" and agent_type="general-purpose". The fields are
// conditionally PRESENT — absent, not null, in the main session. The synthetic
// payloads below use that exact captured key shape.
//
// The predicate lives in hooks/lib/ rather than in the hook, so it is testable
// without the hook's top-level payload read — the same seam the shipped
// branch_guard.decide and consent-decision.decideCommitConsent already use, and
// it adds no hook to the roster count.
//
// RED until: .claude/hooks/lib/state-write.mjs exports decideStateWrite, and
// .claude/hooks/state_write_guard.mjs (the 27th hook) calls it.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const STATE_WRITE = join(REPO_ROOT, '.claude/hooks/lib/state-write.mjs');

// The captured main-session shape: agent_id / agent_type are ABSENT KEYS.
const MAIN_SESSION = {
  session_id: 's',
  transcript_path: '/tmp/t.jsonl',
  cwd: REPO_ROOT,
  prompt_id: 'p',
  permission_mode: 'default',
  effort: 'high',
  hook_event_name: 'PreToolUse',
  tool_name: 'Write',
  tool_input: { file_path: '.claude/state/workflow.json' },
  tool_use_id: 'tu',
};

const subagentPayload = (overrides = {}) => ({
  ...MAIN_SESSION,
  agent_id: 'a77f4ef750241df51',
  agent_type: 'general-purpose',
  ...overrides,
});

describe('AC-007 — a subagent is denied a write to .claude/state/**', () => {
  it('test_when_agent_id_is_present_then_a_state_write_is_denied', async () => {
    const { decideStateWrite } = await import(STATE_WRITE);

    for (const path of [
      '.claude/state/workflow.json',
      '.claude/state/harness_state',
      '.claude/state/tdd/some-slug.json',
    ]) {
      const d = decideStateWrite(subagentPayload({ tool_input: { file_path: path } }));
      assert.equal(d.allow, false, `a subagent must not write ${path}`);
      assert.match(String(d.reason ?? ''), /subagent/i, 'the denial must name why it fired');
    }
  });

  it('test_when_a_subagent_edits_rather_than_writes_then_it_is_still_denied', async () => {
    const { decideStateWrite } = await import(STATE_WRITE);

    for (const tool of ['Write', 'Edit', 'MultiEdit', 'NotebookEdit']) {
      const d = decideStateWrite(subagentPayload({ tool_name: tool }));
      assert.equal(d.allow, false, `${tool} to a state path must be denied from a subagent`);
    }
  });
});

describe('AC-008 — the main session is unaffected, and an absent marker reads as main session', () => {
  it('test_when_agent_id_is_absent_or_empty_then_a_state_write_is_allowed', async () => {
    const { decideStateWrite } = await import(STATE_WRITE);

    // The real captured shape: the key is not present at all.
    assert.equal(
      decideStateWrite(MAIN_SESSION).allow,
      true,
      'an absent agent_id must read as the main session'
    );

    // Fail-OPEN is deliberate and asserted, never assumed. If the harness ever
    // stops sending the field, failing closed would deny every main-session
    // state write and brick the workflow.
    assert.equal(
      decideStateWrite({ ...MAIN_SESSION, agent_id: '' }).allow,
      true,
      'an empty agent_id must read as the main session'
    );
    assert.equal(
      decideStateWrite({ ...MAIN_SESSION, agent_id: null }).allow,
      true,
      'a null agent_id must read as the main session'
    );
  });

  it('test_when_a_subagent_writes_outside_the_state_dir_then_it_is_allowed', async () => {
    const { decideStateWrite } = await import(STATE_WRITE);

    const d = decideStateWrite(
      subagentPayload({ tool_input: { file_path: 'src/feature.mjs' } })
    );
    assert.equal(d.allow, true, 'the guard scopes to .claude/state/** and nothing wider');
  });

  it('test_when_the_payload_is_degenerate_then_the_guard_allows_rather_than_throwing', async () => {
    const { decideStateWrite } = await import(STATE_WRITE);

    for (const bad of [undefined, null, {}, { tool_input: null }, { tool_input: {} }]) {
      assert.doesNotThrow(() => decideStateWrite(bad), 'a guard must never throw on a malformed payload');
      assert.equal(decideStateWrite(bad).allow, true, 'an unreadable payload fails open');
    }
  });
});

describe('AC-009 — swarm-worker keeps the writes Article II sanctions', () => {
  it('test_when_swarm_worker_writes_worktree_source_then_allowed_and_state_then_denied', async () => {
    const { decideStateWrite } = await import(STATE_WRITE);

    const worker = (file_path) =>
      decideStateWrite(subagentPayload({ agent_type: 'swarm-worker', tool_input: { file_path } }));

    // swarm-worker is the ONE subagent Article II permits to write. Its code
    // writes must keep working, or this guard breaks the sanctioned path.
    assert.equal(
      worker('/tmp/wt/feature/src/thing.mjs').allow,
      true,
      'swarm-worker must still write source in its worktree'
    );
    assert.equal(
      worker('.claude/state/workflow.json').allow,
      false,
      'swarm-worker writes code, never workflow state'
    );
  });
});

describe('AC-017 — the hook is wired and every count surface agrees', () => {
  it('test_when_the_new_hook_ships_then_it_is_on_disk_and_wired_in_settings', () => {
    const hook = join(REPO_ROOT, '.claude/hooks/state_write_guard.mjs');
    assert.ok(existsSync(hook), 'the 27th hook must exist on disk');

    const settings = readFileSync(join(REPO_ROOT, '.claude/settings.json'), 'utf8');
    assert.match(settings, /state_write_guard/, 'the hook must be wired in settings.json');
  });

  it('test_when_the_new_hook_ships_then_every_count_surface_reads_27_and_names_it', () => {
    const surfaces = [
      'CLAUDE.md',
      'src/CLAUDE.template.md',
      'docs/init/seed.md',
    ];
    for (const rel of surfaces) {
      const text = readFileSync(join(REPO_ROOT, rel), 'utf8');
      assert.match(text, /\b27 hooks\b/, `${rel} must state the new hook count`);
      assert.match(text, /state_write_guard/, `${rel} must name the new hook in its roster`);
    }
  });
});

describe('AC-016 — CLAUDE.md stays within its cap and Article VI is byte-identical', () => {
  // The roster entry costs characters and CLAUDE.md had 14 to spare. The
  // compression that pays for it must not touch Article VI, whose slice ships
  // sha256-pinned. Both are asserted together so neither can be satisfied by
  // breaking the other.
  const MAX_CHARS = 28000;
  const ARTICLE_VI_SHA256 =
    'f0db0f6aa06360eb4b9914ef8f6f62955d2b8d02360b05222e8caff9b0b06a02';

  function articleSixSlice(text) {
    const start = text.indexOf('## Article VI ');
    const end = text.indexOf('## Article VII');
    assert.ok(start >= 0 && end > start, 'both Article VI and VII headings must be present');
    return text.slice(start, end);
  }

  it('test_when_the_roster_entry_is_added_then_claude_md_is_within_cap_and_article_vi_is_unchanged', () => {
    const claude = readFileSync(join(REPO_ROOT, 'CLAUDE.md'), 'utf8');

    assert.ok(
      claude.length <= MAX_CHARS,
      `CLAUDE.md is ${claude.length} chars, over the ${MAX_CHARS} advisory cap`
    );

    const sha = createHash('sha256').update(articleSixSlice(claude), 'utf8').digest('hex');
    assert.equal(
      sha,
      ARTICLE_VI_SHA256,
      'Article VI ships byte-identical — the compression must come from elsewhere'
    );
  });

  it('test_when_claude_md_changes_then_its_mirror_stays_byte_equal', () => {
    const claude = readFileSync(join(REPO_ROOT, 'CLAUDE.md'), 'utf8');
    const mirror = readFileSync(join(REPO_ROOT, 'src/CLAUDE.template.md'), 'utf8');
    assert.equal(claude, mirror, 'src/CLAUDE.template.md is a byte-equal mirror');
  });
});
