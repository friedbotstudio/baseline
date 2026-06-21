// tdd sub-tick stamping — break the collapsed "tdd" timing row into per-worker-tick
// sub-rows (backlog -v0lv: sub-resolution prerequisite for ranking the dominant phase).
//
// A tdd_ticks[] ledger in workflow.json is diffed by stampFromWorkflow into
// {phase:"tdd:<tick>", event:"sub"} rows; renderTable nests them under the tdd
// rollup (Option A). Gated by artifacts.subtick_timing.enabled (default on).
// SUT: .claude/hooks/lib/timing.mjs + .claude/hooks/phase_timer.mjs.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const TIMING_LIB = join(REPO_ROOT, '.claude/hooks/lib/timing.mjs');
const HOOK = join(REPO_ROOT, '.claude/hooks/phase_timer.mjs');
const importTiming = () => import(TIMING_LIB);

const TRANSCRIPT_LINE = JSON.stringify({
  type: 'assistant',
  timestamp: '2027-01-01T00:00:00Z',
  message: { usage: { output_tokens: 10, input_tokens: 5, cache_read_input_tokens: 100 } },
});

async function makeRoot(workflow) {
  const root = await mkdtemp(join(tmpdir(), 'tdd-subtick-'));
  await mkdir(join(root, '.claude/state'), { recursive: true });
  await writeFile(join(root, '.claude/state/workflow.json'), JSON.stringify(workflow) + '\n');
  await writeFile(join(root, 'transcript.jsonl'), TRANSCRIPT_LINE + '\n');
  return root;
}

const transcriptPath = (root) => join(root, 'transcript.jsonl');

function readStamps(root, slug) {
  const p = join(root, '.claude/state/timing', `${slug}.jsonl`);
  if (!existsSync(p)) return [];
  return readFileSync(p, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
}

// Parse a rendered markdown table into {phase, model, out} rows. The phase cell may
// carry the '└ ' nesting prefix for sub-rows; keep it raw so tests can assert on it.
function parseRows(md) {
  const rows = [];
  for (const line of md.split('\n')) {
    const m = /^\|\s*(.+?)\s*\|\s*(\d+)\s*\|\s*(\S+)\s*\|\s*(\S+)\s*\|/.exec(line);
    if (!m) continue;
    if (m[1] === 'Phase') continue;
    rows.push({ phase: m[1], model: Number(m[2]), out: m[4] });
  }
  return rows;
}

describe('tdd sub-tick stamping', () => {
  it('test_when_tdd_ticks_present_and_flag_on_then_sub_rows_stamped', async () => {
    const root = await makeRoot({ slug: 't', completed: [], tdd_ticks: ['scenario', 'implement'], created_at: 1782000000 });
    try {
      const { stampFromWorkflow } = await importTiming();
      stampFromWorkflow({ rootDir: root, transcriptPath: transcriptPath(root), subtickEnabled: true });
      const stamps = readStamps(root, 't');
      assert.ok(stamps.some((s) => s.phase === 'tdd:scenario' && s.event === 'sub'), `missing tdd:scenario sub\n${JSON.stringify(stamps)}`);
      assert.ok(stamps.some((s) => s.phase === 'tdd:implement' && s.event === 'sub'), `missing tdd:implement sub\n${JSON.stringify(stamps)}`);
      assert.ok(stamps.some((s) => s.phase === 'run-start' && s.event === 'baseline'), 'missing run-start baseline');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('test_when_subtick_flag_off_then_no_sub_rows', async () => {
    const root = await makeRoot({ slug: 't', completed: [], tdd_ticks: ['scenario', 'implement'], created_at: 1782000000 });
    try {
      const { stampFromWorkflow } = await importTiming();
      stampFromWorkflow({ rootDir: root, transcriptPath: transcriptPath(root), subtickEnabled: false });
      const subs = readStamps(root, 't').filter((s) => s.event === 'sub');
      assert.equal(subs.length, 0, `flag-off must write no sub rows\n${JSON.stringify(subs)}`);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('test_when_tdd_ticks_unchanged_then_idempotent_noop', async () => {
    const root = await makeRoot({ slug: 't', completed: [], tdd_ticks: ['scenario', 'implement'], created_at: 1782000000 });
    try {
      const { stampFromWorkflow } = await importTiming();
      stampFromWorkflow({ rootDir: root, transcriptPath: transcriptPath(root), subtickEnabled: true });
      const afterFirst = readStamps(root, 't').filter((s) => s.event === 'sub').length;
      stampFromWorkflow({ rootDir: root, transcriptPath: transcriptPath(root), subtickEnabled: true });
      const afterSecond = readStamps(root, 't').filter((s) => s.event === 'sub').length;
      assert.equal(afterSecond, afterFirst, 'unchanged tdd_ticks must append no new sub rows');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('test_when_render_then_sub_rows_nested_and_sum_equals_rollup', async () => {
    const root = await makeRoot({ slug: 't', created_at: 1 });
    try {
      await mkdir(join(root, '.claude/state/timing'), { recursive: true });
      const lines = [
        { phase: 'run-start', event: 'baseline', ts: 1000, out_tokens: 0, in_tokens: 0, cache_tokens: 0 },
        { phase: 'tdd:scenario', event: 'sub', ts: 1100, out_tokens: 20, in_tokens: 0, cache_tokens: 0 },
        { phase: 'tdd:implement', event: 'sub', ts: 1300, out_tokens: 70, in_tokens: 0, cache_tokens: 0 },
        { phase: 'tdd', event: 'completed', ts: 1300, out_tokens: 70, in_tokens: 0, cache_tokens: 0 },
      ].map((r) => JSON.stringify(r)).join('\n') + '\n';
      await writeFile(join(root, '.claude/state/timing/t.jsonl'), lines);

      const { renderTable } = await importTiming();
      const md = renderTable({ rootDir: root, slug: 't' });

      assert.match(md, /└ ?tdd:scenario/, `scenario sub must be nested with '└'\n${md}`);
      assert.match(md, /└ ?tdd:implement/, `implement sub must be nested with '└'\n${md}`);

      const rows = parseRows(md);
      const rollup = rows.find((r) => r.phase === 'tdd');
      const sub1 = rows.find((r) => /tdd:scenario/.test(r.phase));
      const sub2 = rows.find((r) => /tdd:implement/.test(r.phase));
      assert.ok(rollup && sub1 && sub2, `need rollup + both subs\n${md}`);
      assert.equal(sub1.model + sub2.model, rollup.model, 'sub model deltas must sum to the tdd rollup model');
      assert.equal(Number(sub1.out) + Number(sub2.out), Number(rollup.out), 'sub out-tokens must sum to the rollup out-tokens');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('test_when_flag_on_via_phase_timer_then_subrow_stamped', async () => {
    const live = JSON.parse(await readFile(join(REPO_ROOT, '.claude/project.json'), 'utf8'));
    live.artifacts = live.artifacts || {};
    live.artifacts.subtick_timing = { enabled: true };
    const root = await makeRoot({ slug: 't', completed: [], tdd_ticks: ['scenario'], created_at: 1782000000 });
    try {
      await mkdir(join(root, '.claude'), { recursive: true });
      await writeFile(join(root, '.claude/project.json'), JSON.stringify(live, null, 2) + '\n');
      const payload = {
        tool_name: 'Write',
        tool_input: { file_path: join(root, '.claude/state/workflow.json') },
        transcript_path: transcriptPath(root),
      };
      spawnSync('node', [HOOK], {
        cwd: root,
        env: { ...process.env, CLAUDE_PROJECT_DIR: root, CLAUDE_PROJECT_ROOT: root, HOOK_PAYLOAD: JSON.stringify(payload) },
        input: JSON.stringify(payload),
        encoding: 'utf8',
      });
      const stamps = readStamps(root, 't');
      assert.ok(
        stamps.some((s) => s.phase === 'tdd:scenario' && s.event === 'sub'),
        `phase_timer with the flag on must stamp a tdd:scenario sub row\n${JSON.stringify(stamps)}`,
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
