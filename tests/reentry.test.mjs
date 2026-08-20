// work-planner-envelope — the instrumentation half.
//
// `attempts` is the one field the harness writes by SKILL.md prose rather than by
// hook, and it is the one field never recorded once across 117 archived bundles.
// The archived timing research predicted exactly this when it chose a hook over a
// model-appended log: a prose-driven record "is written by the model following
// SKILL.md prose; a missed/misordered append silently corrupts the table."
//
// D5 does not make it oracle-bound — nothing here can, because `phase_timer`
// observes `completed[]` and a re-entry never changes that array. What these tests
// pin is the smaller claim D5 actually makes: one writer, one call site, and a
// round-trip through the real ledger.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { REPO_ROOT, tryImport } from './helpers/memory-fixtures.mjs';

const REENTRY = '.claude/skills/harness/reentry.mjs';
const ENVELOPE = '.claude/skills/harness/envelope.mjs';

function tempRepo(workflow = {}) {
  const root = mkdtempSync(join(tmpdir(), 'reentry-'));
  mkdirSync(join(root, '.claude', 'state'), { recursive: true });
  const wf = { slug: 'w', track_id: 'intake-full', completed: [], created_at: 1700000000, ...workflow };
  writeFileSync(join(root, '.claude/state/workflow.json'), JSON.stringify(wf, null, 2), 'utf8');
  return root;
}

const readWorkflow = (root) => JSON.parse(readFileSync(join(root, '.claude/state/workflow.json'), 'utf8'));

describe('reentry — the sole writer of workflow.json attempts', () => {
  it('test_when_phase_reentered_then_attempts_increments', async () => {
    const mod = await tryImport(REENTRY);
    assert.ok(mod, `${REENTRY} must exist — it is the single writer AC-007 depends on`);
    const root = tempRepo();

    mod.recordReentry({ rootDir: root, slug: 'w', phase: 'tdd' });
    assert.equal(readWorkflow(root).attempts.tdd, 2,
      'the first recorded re-entry is the SECOND entry, so the counter starts at 2 — a 1 here means the initial entry was double-counted');

    mod.recordReentry({ rootDir: root, slug: 'w', phase: 'tdd' });
    assert.equal(readWorkflow(root).attempts.tdd, 3);

    mod.recordReentry({ rootDir: root, slug: 'w', phase: 'integrate' });
    const after = readWorkflow(root).attempts;
    assert.equal(after.integrate, 2, 'each phase counts independently');
    assert.equal(after.tdd, 3, 'recording one phase must not disturb another');
  });

  it('test_when_reentry_writes_then_it_touches_no_other_workflow_field', async () => {
    const mod = await tryImport(REENTRY);
    assert.ok(mod, `${REENTRY} must exist`);
    const root = tempRepo({ completed: ['intake', 'spec'], source_backlog_keys: ['k1'], exceptions: ['chore'] });
    const before = readWorkflow(root);

    mod.recordReentry({ rootDir: root, slug: 'w', phase: 'spec' });

    const after = readWorkflow(root);
    assert.deepEqual(after.completed, before.completed, 'completed[] is not reentry\'s to touch');
    assert.deepEqual(after.source_backlog_keys, before.source_backlog_keys);
    assert.deepEqual(after.exceptions, before.exceptions);
  });

  it('test_when_attempts_recorded_then_timing_stamps_an_attempt_row', async () => {
    const reentry = await tryImport(REENTRY);
    assert.ok(reentry, `${REENTRY} must exist`);
    const timing = await import(join(REPO_ROOT, '.claude/hooks/lib/timing.mjs'));

    const root = tempRepo({ completed: ['tdd'] });
    reentry.recordReentry({ rootDir: root, slug: 'w', phase: 'tdd' });
    timing.stampFromWorkflow({ rootDir: root });

    const dir = join(root, '.claude/state/timing');
    const rows = readdirSync(dir)
      .flatMap((f) => readFileSync(join(dir, f), 'utf8').trim().split('\n'))
      .filter(Boolean)
      .map((l) => JSON.parse(l));

    const retry = rows.find((r) => r.phase === 'tdd:attempt-2');
    assert.ok(retry, `the ledger must carry a tdd:attempt-2 row; got ${rows.map((r) => r.phase).join(', ')}`);
    assert.equal(retry.event, 'retry', 'a re-entry is a retry event, distinct from completed and sub');
  });

  it('test_when_reentry_lands_then_it_is_the_only_writer_of_attempts', () => {
    // D5's actual claim. A second writer re-opens the multi-step hand edit that
    // produced zero records in 117 bundles, so this is the assertion that matters.
    const offenders = [];
    const walk = (dir) => {
      for (const name of readdirSync(dir)) {
        if (name === 'node_modules' || name.startsWith('.git')) continue;
        const p = join(dir, name);
        if (statSync(p).isDirectory()) { walk(p); continue; }
        if (!/\.mjs$/.test(name)) continue;
        const rel = p.slice(REPO_ROOT.length + 1);
        if (rel.endsWith('reentry.mjs')) continue;
        const body = readFileSync(p, 'utf8');
        if (/\battempts\s*(\[[^\]]+\]\s*)?=[^=]/.test(body) || /\.attempts\s*=[^=]/.test(body)) offenders.push(rel);
      }
    };
    walk(join(REPO_ROOT, '.claude'));
    assert.deepEqual(offenders, [], 'only reentry.mjs may assign to attempts');
  });
});

describe('payload stamping (AC-006)', () => {
  it('test_when_payload_phase_completes_then_its_timing_row_carries_tokens', async () => {
    const timing = await import(join(REPO_ROOT, '.claude/hooks/lib/timing.mjs'));
    const root = tempRepo({ completed: ['tdd'] });
    timing.stampFromWorkflow({ rootDir: root });

    const dir = join(root, '.claude/state/timing');
    const rows = readdirSync(dir)
      .flatMap((f) => readFileSync(join(dir, f), 'utf8').trim().split('\n'))
      .filter(Boolean)
      .map((l) => JSON.parse(l));

    const payload = rows.find((r) => r.phase === 'tdd');
    assert.ok(payload, 'the payload phase must produce a row at all');
    assert.equal(payload.event, 'completed');
    assert.ok('ts' in payload, 'a payload row without a timestamp cannot anchor a token delta');
  });
});

describe('envelope counts re-entry cost (AC-008)', () => {
  it('test_when_corpus_carries_retry_rows_then_the_fit_counts_them', async () => {
    const mod = await tryImport(ENVELOPE);
    assert.ok(mod, `${ENVELOPE} must exist`);

    const bundle = (root, day, slug, track, rows) => {
      const dir = join(root, 'docs/archive', day, slug);
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, 'workflow.json'), JSON.stringify({ track_id: track }), 'utf8');
      const body = ['| Phase | Model (ms) | Human-wait (ms) | Tokens (out) | Tokens (in) | Tokens (cache) |',
        '|---|---|---|---|---|---|',
        ...rows.map(([p, t]) => `| ${p} | 0 | 0 | ${t} | 0 | 0 |`)].join('\n');
      writeFileSync(join(dir, 'timing.md'), `# Phase timing — ${slug}\n\n${body}\n`, 'utf8');
    };

    const mk = (withRetry) => {
      const root = mkdtempSync(join(tmpdir(), 'env-retry-'));
      for (let i = 0; i < 5; i++) {
        const rows = [['tdd', 1000], ['security', 100], ['integrate', 100]];
        // The renderer prefixes every child row with `└ ` (timing.mjs:336). A retry
        // written without it is a shape production never emits.
        if (withRetry) rows.push(['└ security:attempt-2', 400]);
        bundle(root, '2026-01-0' + (i + 1), 's' + i, 'intake-full', rows);
      }
      return root;
    };

    const clean = mod.envelopeFor({ rootDir: mk(false), track: 'intake-full' });
    const retried = mod.envelopeFor({ rootDir: mk(true), track: 'intake-full' });

    assert.ok(retried.envelope_tokens > clean.envelope_tokens,
      `a corpus carrying attempt rows must fit a LARGER envelope (${retried.envelope_tokens} vs ${clean.envelope_tokens}) — otherwise re-spec cost is excluded and every ratio is flattered`);
  });
});
