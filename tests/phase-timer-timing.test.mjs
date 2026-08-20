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

function writeWorkflow(root, { slug = 'demo', completed = [], created_at = 1000, attempts } = {}) {
  const wf = { slug, completed, created_at };
  if (attempts !== undefined) wf.attempts = attempts;
  writeFileSync(statePath(root, 'workflow.json'), JSON.stringify(wf));
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
      // created_at 1000s == 1_000_000ms; now() is ms and must sit AFTER it, else
      // phase-1 spans a negative interval. The original fixture used now()=5_000
      // (before created_at) — harmless while the baseline row carried now(),
      // load-bearing now that it carries created_at*1000.
      writeWorkflow(root, { slug: 'demo', completed: ['intake'], created_at: 1000 });
      const out = stampFromWorkflow({ rootDir: root, now: () => 5_000_000 });
      assert.deepEqual(out.appended, ['intake']);
      // First stamp for a slug also writes a run-start baseline anchoring
      // phase-1's token delta (phase-token-instrumentation). No transcriptPath
      // here, so the baseline carries no token fields.
      const stamps = readStamps(root, 'demo');
      assert.equal(stamps.length, 2);
      // Field-wise, not deepEqual: rows carry additive provenance fields
      // (batch_id / batch_size / wait_ms) that an exact-match assertion would
      // reject on every future extension.
      assert.equal(stamps[0].phase, 'run-start');
      assert.equal(stamps[0].event, 'baseline');
      assert.equal(stamps[0].ts, 1_000_000, 'baseline anchors at created_at*1000, not now()');
      assert.equal(stamps[1].phase, 'intake');
      assert.equal(stamps[1].event, 'completed');
      assert.equal(stamps[1].ts, 5_000_000);
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

// ---- timing-instrument-repair — JSONL fidelity -----------------------------
//
// The JSONL must be self-describing: post-hoc analysis reads it AFTER /commit
// has archived workflow.json away, so anything the renderer derives live from
// workflow.json is unavailable to a later reader.

function writeRawWorkflow(root, obj) {
  writeFileSync(statePath(root, 'workflow.json'), JSON.stringify(obj));
}

describe('defect-1 — run-start baseline anchors at created_at', () => {
  it('test_when_workflow_has_created_at_then_baseline_row_ts_equals_created_at_ms', async () => {
    const { stampFromWorkflow } = await importTiming();
    withRoot((root) => {
      writeWorkflow(root, { slug: 'demo', completed: ['intake'], created_at: 1_700_000 });
      stampFromWorkflow({ rootDir: root, now: () => 1_700_500_000 });
      const baseline = readStamps(root, 'demo').find((s) => s.event === 'baseline');
      assert.equal(baseline.ts, 1_700_000_000, 'created_at(s) * 1000, not the injected now()');
    });
  });

  it('test_when_created_at_is_absent_or_non_finite_then_baseline_row_ts_falls_back_to_now', async () => {
    const { stampFromWorkflow } = await importTiming();
    const variants = [
      ['absent', { slug: 'demo', completed: ['intake'] }],
      ['null', { slug: 'demo', completed: ['intake'], created_at: null }],
      ['string', { slug: 'demo', completed: ['intake'], created_at: 'nope' }],
    ];
    for (const [label, wf] of variants) {
      withRoot((root) => {
        writeRawWorkflow(root, wf);
        stampFromWorkflow({ rootDir: root, now: () => 4_242_000 });
        const baseline = readStamps(root, 'demo').find((s) => s.event === 'baseline');
        assert.equal(baseline.ts, 4_242_000, `created_at ${label} -> falls back to now()`);
      });
    }
  });
});

describe('defect-3 — gate roster and stored wait_ms', () => {
  it('test_when_approve_direction_is_stamped_then_it_is_treated_as_a_gate', async () => {
    const { renderTable } = await importTiming();
    for (const gate of ['approve-direction', 'approve-spec']) {
      withRoot((root) => {
        writeWorkflow(root, { slug: 'demo', completed: ['spec', gate, 'tdd'], created_at: 1000 });
        seedStamps(root, 'demo', [
          { phase: 'spec', ts: 5_000_000 },
          { phase: gate, ts: 7_000_000 },
          { phase: 'tdd', ts: 9_000_000 },
        ]);
        const md = renderTable({ rootDir: root, slug: 'demo' });
        assert.doesNotMatch(md, new RegExp(`\\|\\s*${gate}\\s*\\|`), `${gate} is a gate, not a phase row`);
      });
    }
  });

  it('test_when_a_gate_row_is_stamped_then_wait_ms_is_the_gap_since_the_previous_stamp', async () => {
    const { stampFromWorkflow } = await importTiming();
    withRoot((root) => {
      writeWorkflow(root, { slug: 'demo', completed: ['spec'], created_at: 1000 });
      stampFromWorkflow({ rootDir: root, now: () => 5_000_000 });
      writeWorkflow(root, { slug: 'demo', completed: ['spec', 'approve-direction'], created_at: 1000 });
      stampFromWorkflow({ rootDir: root, now: () => 8_000_000 });
      const gate = readStamps(root, 'demo').find((s) => s.phase === 'approve-direction');
      assert.equal(gate.wait_ms, 3_000_000, 'gate wait = own ts - previous stamp ts');
    });
  });

  it('test_when_a_non_gate_row_is_stamped_then_wait_ms_is_zero', async () => {
    const { stampFromWorkflow } = await importTiming();
    withRoot((root) => {
      writeWorkflow(root, { slug: 'demo', completed: ['spec'], created_at: 1000 });
      stampFromWorkflow({ rootDir: root, now: () => 5_000_000 });
      writeWorkflow(root, { slug: 'demo', completed: ['spec', 'tdd'], created_at: 1000 });
      stampFromWorkflow({ rootDir: root, now: () => 8_000_000 });
      const work = readStamps(root, 'demo').find((s) => s.phase === 'tdd');
      assert.equal(work.wait_ms, 0, 'non-gate phases carry no human wait');
    });
  });
});

describe('regression — additive fields do not disturb existing consumers', () => {
  it('test_when_stamps_predate_the_new_fields_then_render_table_still_renders', async () => {
    const { renderTable } = await importTiming();
    withRoot((root) => {
      writeWorkflow(root, { slug: 'demo', completed: ['spec', 'tdd'], created_at: 1000 });
      // seedStamps writes the pre-change row shape: no batch_id/batch_size/wait_ms.
      seedStamps(root, 'demo', [{ phase: 'spec', ts: 5_000_000 }, { phase: 'tdd', ts: 9_000_000 }]);
      let md;
      assert.doesNotThrow(() => { md = renderTable({ rootDir: root, slug: 'demo' }); });
      assert.match(md, rowRe('spec', 4_000_000, 0), 'legacy rows still render');
    });
  });

  it('test_when_workflow_json_is_present_then_render_table_run_start_anchor_is_unchanged', async () => {
    const { renderTable } = await importTiming();
    withRoot((root) => {
      writeWorkflow(root, { slug: 'demo', completed: ['intake'], created_at: 1000 });
      // Baseline ts is deliberately WRONG. renderTable derives runStart from
      // workflow.json, so correcting the baseline row must not shift the render.
      mkdirSync(dirname(jsonlPath(root, 'demo')), { recursive: true });
      writeFileSync(jsonlPath(root, 'demo'), [
        JSON.stringify({ phase: 'run-start', event: 'baseline', ts: 999_999_999 }),
        JSON.stringify({ phase: 'intake', event: 'completed', ts: 3_000_000 }),
      ].join('\n') + '\n');
      const md = renderTable({ rootDir: root, slug: 'demo' });
      assert.match(md, rowRe('intake', 2_000_000, 0), 'anchored at created_at*1000 regardless of baseline.ts');
    });
  });
});

// ---- phase re-entry stamps (cycle-time-fixes, item 1) ----------------------
//
// The harness integrate auto-loop re-invokes `tdd` and `integrate` in place
// (harness/SKILL.md), without touching `completed[]`. Because stampFromWorkflow
// dedups on a bare phase name, every one of those retries was invisible: across
// 67 archived spec runs the timing logs recorded zero phase re-entries, so the
// span that actually dominates a run could not be measured at all.
//
// Contract pinned here:
//   * workflow.json carries `attempts: {"<phase>": <n>}` — n counts how many
//     times the phase has been ENTERED, so 1 is the original run and needs no
//     extra row (the `completed` stamp already covers it).
//   * stampFromWorkflow appends one row per not-yet-stamped attempt k in 2..n:
//     {"phase":"<phase>:attempt-<k>","event":"retry", ...}. A jump from 1 to 3
//     emits BOTH 2 and 3 — a batched increment must not silently lose a retry.
//   * The composed label is the dedup key, so the hook stays idempotent under
//     the unconditional Bash-leg invocation.
//   * A malformed `attempts` is ignored whole. Timing is best-effort; it must
//     never throw into a phase.

const retryRows = (root, slug) => readStamps(root, slug).filter((s) => s.event === 'retry');

describe('phase re-entry — attempts become durable retry stamps', () => {
  it('test_when_attempts_exceeds_one_then_a_retry_row_is_appended', async () => {
    const { stampFromWorkflow } = await importTiming();
    withRoot((root) => {
      writeWorkflow(root, { slug: 'demo', completed: ['tdd'], created_at: 1000, attempts: { tdd: 2 } });
      stampFromWorkflow({ rootDir: root, now: () => 5_000_000 });
      const rows = retryRows(root, 'demo');
      assert.equal(rows.length, 1, 'one retry row for attempt 2');
      assert.equal(rows[0].phase, 'tdd:attempt-2');
      assert.equal(rows[0].ts, 5_000_000);
    });
  });

  it('test_when_stamped_twice_with_same_attempts_then_no_duplicate_row', async () => {
    const { stampFromWorkflow } = await importTiming();
    withRoot((root) => {
      writeWorkflow(root, { slug: 'demo', completed: ['tdd'], created_at: 1000, attempts: { tdd: 2 } });
      stampFromWorkflow({ rootDir: root, now: () => 5_000_000 });
      const second = stampFromWorkflow({ rootDir: root, now: () => 6_000_000 });
      assert.deepEqual(second.appended, [], 'idempotent under the unconditional Bash leg');
      assert.equal(retryRows(root, 'demo').length, 1);
    });
  });

  it('test_when_attempts_jumps_by_more_than_one_then_every_missed_attempt_is_stamped', async () => {
    const { stampFromWorkflow } = await importTiming();
    withRoot((root) => {
      writeWorkflow(root, { slug: 'demo', completed: ['integrate'], created_at: 1000, attempts: { integrate: 4 } });
      stampFromWorkflow({ rootDir: root, now: () => 5_000_000 });
      assert.deepEqual(
        retryRows(root, 'demo').map((r) => r.phase),
        ['integrate:attempt-2', 'integrate:attempt-3', 'integrate:attempt-4']
      );
    });
  });

  it('test_when_attempts_grows_between_calls_then_only_the_new_attempt_is_stamped', async () => {
    const { stampFromWorkflow } = await importTiming();
    withRoot((root) => {
      writeWorkflow(root, { slug: 'demo', completed: ['tdd'], created_at: 1000, attempts: { tdd: 2 } });
      stampFromWorkflow({ rootDir: root, now: () => 5_000_000 });
      writeWorkflow(root, { slug: 'demo', completed: ['tdd'], created_at: 1000, attempts: { tdd: 3 } });
      const out = stampFromWorkflow({ rootDir: root, now: () => 7_000_000 });
      assert.deepEqual(out.appended, ['tdd:attempt-3']);
      assert.deepEqual(retryRows(root, 'demo').map((r) => r.phase), ['tdd:attempt-2', 'tdd:attempt-3']);
    });
  });

  it('test_when_attempts_is_one_then_no_retry_row', async () => {
    const { stampFromWorkflow } = await importTiming();
    withRoot((root) => {
      writeWorkflow(root, { slug: 'demo', completed: ['tdd'], created_at: 1000, attempts: { tdd: 1 } });
      stampFromWorkflow({ rootDir: root, now: () => 5_000_000 });
      assert.deepEqual(retryRows(root, 'demo'), [], 'attempt 1 is the completed stamp');
    });
  });

  it('test_when_attempts_is_malformed_then_it_is_ignored_and_nothing_throws', async () => {
    const { stampFromWorkflow } = await importTiming();
    for (const attempts of ['lots', 42, null, ['tdd'], { tdd: -3 }, { tdd: 1.5 }, { tdd: 'two' }, { tdd: Infinity }]) {
      withRoot((root) => {
        writeWorkflow(root, { slug: 'demo', completed: ['tdd'], created_at: 1000, attempts });
        assert.doesNotThrow(() => stampFromWorkflow({ rootDir: root, now: () => 5_000_000 }));
        assert.deepEqual(retryRows(root, 'demo'), [], `ignored: ${JSON.stringify(attempts)}`);
      });
    }
  });

  it('test_when_a_retry_is_stamped_then_render_table_nests_it_under_its_parent', async () => {
    const { renderTable } = await importTiming();
    withRoot((root) => {
      writeWorkflow(root, { slug: 'demo', completed: ['tdd'], created_at: 1000, attempts: { tdd: 2 } });
      mkdirSync(dirname(jsonlPath(root, 'demo')), { recursive: true });
      writeFileSync(jsonlPath(root, 'demo'), [
        JSON.stringify({ phase: 'tdd', event: 'completed', ts: 3_000_000 }),
        JSON.stringify({ phase: 'tdd:attempt-2', event: 'retry', ts: 8_000_000 }),
      ].join('\n') + '\n');
      const md = renderTable({ rootDir: root, slug: 'demo' });
      assert.match(md, /\|\s*└ tdd:attempt-2\s*\|\s*5000000\s*\|/, 'retry renders nested, charged from the parent');
      assert.match(md, rowRe('tdd', 2_000_000, 0), 'the parent row is unchanged');
    });
  });
});
