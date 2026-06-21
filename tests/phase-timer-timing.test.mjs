// phase-timing-instrumentation — Candidate B (deterministic PostToolUse timer hook).
//
// RED until:
//   - .claude/hooks/lib/timing.mjs exports stampFromWorkflow + renderTable and a
//     `render <slug> [bundleDir]` CLI.
//   - .claude/hooks/phase_timer.mjs is a PostToolUse adapter that stamps only when
//     the edited path is .claude/state/workflow.json, never blocks, never mutates.
//
// Contract pinned by these tests (the implement worker codes to them):
//   * timing JSONL line: {"phase":<name>,"event":"completed","ts":<epoch_ms>}
//   * workflow.json created_at is epoch SECONDS; render anchors run-start at created_at*1000.
//   * renderTable rows: `| <phase> | <model_ms> | <human_wait> |`, human_wait an
//     integer ms, 0, or the literal `n/a`. Gate phase = approve-spec; its wait is
//     attributed to the first work phase stamped after the spec-family phases.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, utimesSync, rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const TIMING_LIB = join(REPO_ROOT, '.claude/hooks/lib/timing.mjs');
const HOOK = join(REPO_ROOT, '.claude/hooks/phase_timer.mjs');

// ---- Foundation: temp-root fixtures ----------------------------------------

function withRoot(fn) {
  const root = mkdtempSync(join(tmpdir(), 'ptt-'));
  try {
    mkdirSync(join(root, '.claude/state'), { recursive: true });
    return fn(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

const statePath = (root, ...p) => join(root, '.claude/state', ...p);

function writeWorkflow(root, { slug = 'demo', completed = [], created_at = 1000 } = {}) {
  writeFileSync(statePath(root, 'workflow.json'), JSON.stringify({ slug, completed, created_at }));
}

function jsonlPath(root, slug) { return statePath(root, 'timing', `${slug}.jsonl`); }

function readStamps(root, slug) {
  const p = jsonlPath(root, slug);
  if (!existsSync(p)) return [];
  return readFileSync(p, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
}

function seedStamps(root, slug, stamps) {
  mkdirSync(dirname(jsonlPath(root, slug)), { recursive: true });
  writeFileSync(jsonlPath(root, slug),
    stamps.map((s) => JSON.stringify({ phase: s.phase, event: 'completed', ts: s.ts })).join('\n') + '\n');
}

function writeApprovalToken(root, slug, mtimeSec) {
  const p = statePath(root, 'spec_approvals', `${slug}.approval`);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, 'APPROVED\n');
  utimesSync(p, mtimeSec, mtimeSec); // atime, mtime in seconds
}

// ---- Foundation: hook child-process runner ---------------------------------

function runHook(root, payload) {
  return spawnSync('node', [HOOK], {
    input: JSON.stringify(payload),
    env: { ...process.env, CLAUDE_PROJECT_DIR: root },
    encoding: 'utf8',
  });
}

const editPayload = (filePath, tool = 'Edit') => ({ tool_name: tool, tool_input: { file_path: filePath } });

const importTiming = () => import(TIMING_LIB);

// ---- AC-001 — stamp on completed[] growth ----------------------------------

describe('AC-001 — durable stamp when completed[] grows', () => {
  it('test_when_completed_grows_then_one_stamp_appended', async () => {
    const { stampFromWorkflow } = await importTiming();
    withRoot((root) => {
      writeWorkflow(root, { slug: 'demo', completed: ['intake'], created_at: 1000 });
      const out = stampFromWorkflow({ rootDir: root, now: () => 5_000 });
      assert.deepEqual(out.appended, ['intake']);
      // First stamp for a slug also writes a run-start baseline anchoring
      // phase-1's token delta (phase-token-instrumentation). No transcriptPath
      // here, so the baseline carries no token fields.
      const stamps = readStamps(root, 'demo');
      assert.equal(stamps.length, 2);
      assert.deepEqual(stamps[0], { phase: 'run-start', event: 'baseline', ts: 5_000 });
      assert.deepEqual(stamps[1], { phase: 'intake', event: 'completed', ts: 5_000 });
    });
  });

  it('test_when_refire_unchanged_then_no_new_line', async () => {
    const { stampFromWorkflow } = await importTiming();
    withRoot((root) => {
      writeWorkflow(root, { slug: 'demo', completed: ['intake'] });
      seedStamps(root, 'demo', [{ phase: 'intake', ts: 5_000 }]);
      const out = stampFromWorkflow({ rootDir: root, now: () => 9_999 });
      assert.deepEqual(out.appended, []);
      assert.equal(readStamps(root, 'demo').length, 1, 'idempotent: no new line');
    });
  });

  it('test_when_two_phases_added_then_both_stamped_in_order', async () => {
    const { stampFromWorkflow } = await importTiming();
    withRoot((root) => {
      writeWorkflow(root, { slug: 'demo', completed: ['intake'] });
      seedStamps(root, 'demo', [{ phase: 'intake', ts: 5_000 }]);
      writeWorkflow(root, { slug: 'demo', completed: ['intake', 'scout', 'research'] });
      const out = stampFromWorkflow({ rootDir: root, now: () => 7_000 });
      assert.deepEqual(out.appended, ['scout', 'research'], 'both new phases, in completed[] order');
      assert.deepEqual(readStamps(root, 'demo').map((s) => s.phase), ['intake', 'scout', 'research']);
    });
  });
});

// ---- AC-004 — hook is an observation-only adapter --------------------------

describe('AC-004 — hook routes by path, never mutates', () => {
  it('test_when_path_not_workflow_json_then_hook_noop', () => {
    withRoot((root) => {
      writeWorkflow(root, { slug: 'demo', completed: ['intake'] });
      // control: editing workflow.json DOES produce a stamp (proves the wiring)
      const wf = runHook(root, editPayload(statePath(root, 'workflow.json')));
      assert.equal(wf.status, 0, 'hook exits 0 on workflow.json');
      assert.ok(existsSync(jsonlPath(root, 'demo')), 'stamp written for workflow.json edit');
      // subject: editing any other path writes nothing new
      const before = readStamps(root, 'demo').length;
      const other = runHook(root, editPayload(join(root, 'src/whatever.mjs')));
      assert.equal(other.status, 0, 'hook exits 0 on non-workflow path');
      assert.equal(readStamps(root, 'demo').length, before, 'no stamp for non-workflow path');
    });
  });

  it('test_when_workflow_json_absent_then_no_throw', async () => {
    const { stampFromWorkflow } = await importTiming();
    withRoot((root) => {
      const out = stampFromWorkflow({ rootDir: root, now: () => 1 });
      assert.deepEqual(out.appended, [], 'absent workflow.json -> {appended:[]}');
      writeFileSync(statePath(root, 'workflow.json'), '{ this is not json ');
      const out2 = stampFromWorkflow({ rootDir: root, now: () => 1 });
      assert.deepEqual(out2.appended, [], 'malformed workflow.json -> {appended:[]}, no throw');
    });
  });

  it('test_when_hook_fires_on_unrelated_edit_then_no_side_effects', () => {
    withRoot((root) => {
      writeWorkflow(root, { slug: 'demo', completed: ['intake'] });
      const srcFile = join(root, 'src', 'thing.mjs');
      mkdirSync(dirname(srcFile), { recursive: true });
      const original = 'export const x = 1;\n';
      writeFileSync(srcFile, original);
      const res = runHook(root, editPayload(srcFile));
      assert.equal(res.status, 0);
      assert.equal(readFileSync(srcFile, 'utf8'), original, 'edited file is byte-identical');
      assert.equal(existsSync(statePath(root, 'timing')), false, 'no timing/ dir created');
    });
  });
});

// ---- AC-002 / AC-003 — render the model-vs-human table ---------------------

const rowRe = (phase, model, human) =>
  new RegExp(`\\|\\s*${phase}\\s*\\|\\s*${model}\\s*\\|\\s*${human}\\s*\\|`);

describe('AC-002 — model-vs-human split from the gate boundary', () => {
  it('test_when_token_between_completions_then_model_human_split', async () => {
    const { renderTable } = await importTiming();
    withRoot((root) => {
      writeWorkflow(root, { slug: 'demo', completed: ['spec', 'tdd'], created_at: 1000 }); // start=1_000_000ms
      seedStamps(root, 'demo', [{ phase: 'spec', ts: 5_000_000 }, { phase: 'tdd', ts: 9_000_000 }]);
      writeApprovalToken(root, 'demo', 7000); // mtime 7000s = 7_000_000ms, between spec & tdd
      const md = renderTable({ rootDir: root, slug: 'demo' });
      // spec: first phase, no gate before it -> model = 5_000_000 - 1_000_000, human 0
      assert.match(md, rowRe('spec', 4_000_000, 0));
      // tdd: approve-spec gate -> human = 7_000_000 - 5_000_000, model = 9_000_000 - 7_000_000
      assert.match(md, rowRe('tdd', 2_000_000, 2_000_000));
    });
  });
});

describe('AC-003 — render CLI writes timing.md into the bundle', () => {
  it('test_when_render_then_table_has_model_and_human_columns', () => {
    withRoot((root) => {
      writeWorkflow(root, { slug: 'demo', completed: ['spec', 'tdd'], created_at: 1000 });
      seedStamps(root, 'demo', [{ phase: 'spec', ts: 5_000_000 }, { phase: 'tdd', ts: 9_000_000 }]);
      writeApprovalToken(root, 'demo', 7000);
      const bundle = join(root, 'bundle');
      mkdirSync(bundle, { recursive: true });
      const res = spawnSync('node', [TIMING_LIB, 'render', 'demo', bundle], {
        env: { ...process.env, CLAUDE_PROJECT_DIR: root }, encoding: 'utf8',
      });
      assert.equal(res.status, 0, res.stderr);
      const md = readFileSync(join(bundle, 'timing.md'), 'utf8');
      assert.match(md, /model/i, 'has a model column');
      assert.match(md, /human/i, 'has a human-wait column');
      assert.match(md, rowRe('tdd', 2_000_000, 2_000_000));
    });
  });
});

// ---- AC-005 — edge cases render without throwing ---------------------------

describe('AC-005 — sparse / edge inputs render safely', () => {
  it('test_when_token_missing_then_human_wait_na', async () => {
    const { renderTable } = await importTiming();
    withRoot((root) => {
      writeWorkflow(root, { slug: 'demo', completed: ['spec', 'tdd'], created_at: 1000 });
      seedStamps(root, 'demo', [{ phase: 'spec', ts: 5_000_000 }, { phase: 'tdd', ts: 9_000_000 }]);
      // no approval token written
      const md = renderTable({ rootDir: root, slug: 'demo' });
      assert.match(md, rowRe('tdd', '\\d+', 'n/a'), 'post-spec gate with no token -> n/a');
    });
  });

  it('test_when_token_before_prev_completed_then_clamped_zero', async () => {
    const { renderTable } = await importTiming();
    withRoot((root) => {
      writeWorkflow(root, { slug: 'demo', completed: ['spec', 'tdd'], created_at: 1000 });
      seedStamps(root, 'demo', [{ phase: 'spec', ts: 5_000_000 }, { phase: 'tdd', ts: 9_000_000 }]);
      writeApprovalToken(root, 'demo', 4000); // 4_000_000ms < spec stamp 5_000_000 (clock skew)
      const md = renderTable({ rootDir: root, slug: 'demo' });
      assert.match(md, rowRe('tdd', '\\d+', 0), 'negative human-wait clamps to 0');
      assert.doesNotMatch(md, /-\d/, 'no negative numbers anywhere in the table');
    });
  });

  it('test_when_first_phase_then_anchored_at_created_at', async () => {
    const { renderTable } = await importTiming();
    withRoot((root) => {
      writeWorkflow(root, { slug: 'demo', completed: ['intake'], created_at: 1000 });
      seedStamps(root, 'demo', [{ phase: 'intake', ts: 3_000_000 }]);
      const md = renderTable({ rootDir: root, slug: 'demo' });
      // model = 3_000_000 - created_at*1000 (1_000_000); no gate -> human 0
      assert.match(md, rowRe('intake', 2_000_000, 0));
    });
  });
});
