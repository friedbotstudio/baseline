// phase_timer Bash-side trigger — Lever-0 instrumentation gap fix (backlog -v0lv DP3).
//
// The harness sometimes mutates .claude/state/workflow.json via Bash (node fs,
// `>` redirect, jq, heredoc), which carries tool_name:'Bash' and no file_path —
// so the PostToolUse Write|Edit|MultiEdit matcher never fires and timing/token
// stamps are silently lost. These tests drive the real hook with a Bash payload
// and assert a stamp lands, while keeping the original Write path and the
// other-tool no-op intact. SUT: .claude/hooks/phase_timer.mjs.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const HOOK = join(ROOT, '.claude/hooks/phase_timer.mjs');

const TRANSCRIPT_LINE = JSON.stringify({
  type: 'assistant',
  timestamp: '2027-01-01T00:00:00Z',
  message: { usage: { output_tokens: 10, input_tokens: 5, cache_read_input_tokens: 100 } },
});

// A tmp root carrying a workflow.json whose completed[] holds `phases`, plus a
// one-line session transcript the hook sums token totals from.
async function makeRoot(phases = ['tdd']) {
  const root = await mkdtemp(join(tmpdir(), 'phase-timer-'));
  await mkdir(join(root, '.claude/state'), { recursive: true });
  await writeFile(
    join(root, '.claude/state/workflow.json'),
    JSON.stringify({ slug: 't', completed: phases, created_at: 1782000000 }) + '\n',
  );
  await writeFile(join(root, 'transcript.jsonl'), TRANSCRIPT_LINE + '\n');
  return root;
}

function runHook(root, payload) {
  return spawnSync('node', [HOOK], {
    cwd: root,
    env: { ...process.env, CLAUDE_PROJECT_DIR: root, CLAUDE_PROJECT_ROOT: root, HOOK_PAYLOAD: JSON.stringify(payload) },
    input: JSON.stringify(payload),
    encoding: 'utf8',
  });
}

function readStamps(root) {
  const p = join(root, '.claude/state/timing/t.jsonl');
  if (!existsSync(p)) return null;
  return readFileSync(p, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
}

const transcriptPath = (root) => join(root, 'transcript.jsonl');

describe('phase_timer Bash-side trigger', () => {
  it('test_when_bash_payload_and_fresh_phase_then_stamps', async () => {
    const root = await makeRoot();
    try {
      runHook(root, { tool_name: 'Bash', tool_input: { command: 'node -e "1"' }, transcript_path: transcriptPath(root) });
      const stamps = readStamps(root);
      assert.ok(stamps, 'timing jsonl must exist after a Bash-driven workflow.json mutation');
      assert.ok(
        stamps.some((s) => s.phase === 'tdd' && s.event === 'completed'),
        `expected a completed stamp for phase 'tdd'\n${JSON.stringify(stamps)}`,
      );
      assert.ok(
        stamps.some((s) => s.phase === 'run-start' && s.event === 'baseline'),
        `expected a run-start baseline row\n${JSON.stringify(stamps)}`,
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('test_when_bash_payload_rerun_unchanged_then_idempotent_noop', async () => {
    const root = await makeRoot();
    try {
      const payload = { tool_name: 'Bash', tool_input: { command: 'node -e "1"' }, transcript_path: transcriptPath(root) };
      runHook(root, payload);
      const afterFirst = readStamps(root).length;
      runHook(root, payload);
      const afterSecond = readStamps(root).length;
      assert.equal(afterSecond, afterFirst, 'a re-run with unchanged completed[] must append nothing');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('test_when_non_bash_non_write_tool_then_noop', async () => {
    const root = await makeRoot();
    try {
      runHook(root, { tool_name: 'Read', tool_input: { file_path: 'x' }, transcript_path: transcriptPath(root) });
      assert.equal(readStamps(root), null, 'a Read payload must not create a timing file');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('test_when_write_workflowjson_then_still_stamps', async () => {
    const root = await makeRoot();
    try {
      runHook(root, {
        tool_name: 'Write',
        tool_input: { file_path: join(root, '.claude/state/workflow.json') },
        transcript_path: transcriptPath(root),
      });
      const stamps = readStamps(root);
      assert.ok(stamps, 'timing jsonl must exist after the original Write path');
      assert.ok(
        stamps.some((s) => s.phase === 'tdd' && s.event === 'completed'),
        `the existing Write matcher must keep stamping\n${JSON.stringify(stamps)}`,
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
