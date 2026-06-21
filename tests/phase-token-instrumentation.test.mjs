// phase-token-instrumentation — per-phase TOKEN capture alongside the existing
// per-phase TIMING (velocity-levers -v0lv, info-per-token ranking).
//
// The timing substrate already stamps {phase,event,ts} per completed phase and
// renders a model-vs-human-wait table. These tests pin the token extension:
//   1. stampFromWorkflow sums message.usage.{output,input,cache_read}_tokens
//      across all assistant transcript entries and records them on each stamp.
//   2. The first stamp for a slug appends a {phase:'run-start',event:'baseline'}
//      anchor capturing cumulative tokens at run start.
//   3. renderTable adds a "Tokens (out)" column = per-phase delta of out_tokens
//      between consecutive stamps, with the baseline as anchor (not a phase row).
//   4. Idempotency: a second stamp with unchanged completed[] appends nothing.
//   5. Never-throw: a missing/unreadable/malformed transcript degrades to absent
//      token fields ('n/a' in render), never disturbs the time stamps.
//
// RED until: .claude/hooks/lib/timing.mjs stampFromWorkflow accepts transcriptPath
// and records out/in/cache token fields (+ run-start baseline), and renderTable
// emits the Tokens (out) delta column skipping the baseline row.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { stampFromWorkflow, renderTable } from '../.claude/hooks/lib/timing.mjs';

// ---- foundation fixtures ---------------------------------------------------

function tmpRoot() {
  const root = mkdtempSync(join(tmpdir(), 'ptok-'));
  mkdirSync(join(root, '.claude', 'state', 'timing'), { recursive: true });
  return root;
}

function writeWorkflow(root, { slug, completed, created_at = 1700000000 }) {
  writeFileSync(
    join(root, '.claude', 'state', 'workflow.json'),
    JSON.stringify({ slug, completed, created_at }),
  );
}

// entries: array of either {out,in,cache} (-> assistant w/ usage), the string
// 'user' (-> a non-usage user line), or 'broken' (-> a malformed JSON line).
function writeTranscript(root, entries) {
  const lines = entries.map((e) => {
    if (e === 'user') return JSON.stringify({ type: 'user', message: { role: 'user' } });
    if (e === 'broken') return '{not valid json';
    return JSON.stringify({
      type: 'assistant',
      timestamp: e.tsIso || '2026-06-21T09:00:00.000Z',
      message: {
        usage: {
          output_tokens: e.out,
          input_tokens: e.in,
          cache_read_input_tokens: e.cache,
        },
      },
    });
  });
  const p = join(root, 'transcript.jsonl');
  writeFileSync(p, lines.join('\n') + '\n');
  return p;
}

function writeTiming(root, slug, stamps) {
  writeFileSync(
    join(root, '.claude', 'state', 'timing', `${slug}.jsonl`),
    stamps.map((s) => JSON.stringify(s)).join('\n') + '\n',
  );
}

function readTiming(root, slug) {
  return readFileSync(join(root, '.claude', 'state', 'timing', `${slug}.jsonl`), 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l));
}

const FIXED_NOW = () => 1782000000000;

// Pull a single rendered data row (cells split on '|') whose first cell == phase.
function renderedRow(md, phase) {
  const line = md
    .split('\n')
    .find((l) => l.includes('|') && l.split('|').map((c) => c.trim())[1] === phase);
  return line ? line.split('|').map((c) => c.trim()).filter(Boolean) : null;
}

// ---- 1. cumulative token summation -----------------------------------------

describe('stampFromWorkflow token capture', () => {
  it('test_when_transcript_has_usage_then_stamp_records_cumulative_tokens', () => {
    const root = tmpRoot();
    writeWorkflow(root, { slug: 's1', completed: ['tdd'] });
    const transcriptPath = writeTranscript(root, [
      { out: 100, in: 10, cache: 1000 },
      'user',
      { out: 200, in: 20, cache: 2000 },
      { out: 50, in: 5, cache: 500 },
    ]);

    stampFromWorkflow({ rootDir: root, now: FIXED_NOW, transcriptPath });

    const stamps = readTiming(root, 's1');
    const tdd = stamps.find((s) => s.phase === 'tdd' && s.event === 'completed');
    assert.ok(tdd, 'tdd stamp present');
    assert.equal(tdd.out_tokens, 350, 'cumulative output_tokens');
    assert.equal(tdd.in_tokens, 35, 'cumulative input_tokens');
    assert.equal(tdd.cache_tokens, 3500, 'cumulative cache_read_input_tokens');
  });
});

// ---- 2. run-start baseline -------------------------------------------------

describe('stampFromWorkflow run-start baseline', () => {
  it('test_when_first_stamp_for_slug_then_run_start_baseline_appended', () => {
    const root = tmpRoot();
    writeWorkflow(root, { slug: 's2', completed: ['tdd'] });
    // Entries predate the default created_at (1700000000) so the cutoff baseline sums them.
    const transcriptPath = writeTranscript(root, [
      { out: 70, in: 7, cache: 700, tsIso: '2023-01-01T00:00:00Z' },
      { out: 30, in: 3, cache: 300, tsIso: '2023-01-01T00:00:00Z' },
    ]);

    stampFromWorkflow({ rootDir: root, now: FIXED_NOW, transcriptPath });

    const stamps = readTiming(root, 's2');
    assert.equal(stamps[0].phase, 'run-start', 'baseline is first line');
    assert.equal(stamps[0].event, 'baseline', 'baseline event');
    assert.equal(typeof stamps[0].out_tokens, 'number', 'baseline carries token anchor');
    assert.ok(
      stamps.some((s) => s.phase === 'tdd' && s.event === 'completed'),
      'phase row present after baseline',
    );
  });
});

// ---- 2b. baseline cutoff excludes pre-workflow tokens ----------------------

describe('stampFromWorkflow baseline created_at cutoff', () => {
  it('test_when_baseline_uses_created_at_cutoff_then_phase_delta_excludes_pre_workflow', () => {
    const root = tmpRoot();
    writeWorkflow(root, { slug: 'scut', completed: ['tdd'], created_at: 1700000000 });
    const transcriptPath = writeTranscript(root, [
      { out: 600, in: 0, cache: 0, tsIso: '2023-01-01T00:00:00Z' }, // pre-workflow
      { out: 400, in: 0, cache: 0, tsIso: '2023-01-01T00:00:00Z' }, // pre-workflow
      { out: 500, in: 0, cache: 0, tsIso: '2026-06-21T09:00:00.000Z' }, // in-workflow
    ]);

    stampFromWorkflow({ rootDir: root, now: FIXED_NOW, transcriptPath });

    const stamps = readTiming(root, 'scut');
    const baseline = stamps.find((s) => s.event === 'baseline');
    const tdd = stamps.find((s) => s.phase === 'tdd' && s.event === 'completed');
    assert.equal(baseline.out_tokens, 1000, 'baseline counts only pre-created_at tokens');
    assert.equal(tdd.out_tokens, 1500, 'phase row counts all tokens (no cutoff)');

    const md = renderTable({ rootDir: root, slug: 'scut' });
    const tddRow = renderedRow(md, 'tdd');
    assert.ok(tddRow && tddRow.includes('500'), 'phase-1 delta = 1500-1000 = 500 in-workflow tokens');
  });
});

// ---- 3. render: per-phase token delta column -------------------------------

describe('renderTable token delta column', () => {
  it('test_when_render_then_token_column_is_per_phase_delta', () => {
    const root = tmpRoot();
    writeWorkflow(root, { slug: 's3', completed: ['tdd', 'simplify'] });
    writeTiming(root, 's3', [
      { phase: 'run-start', event: 'baseline', ts: 1000, out_tokens: 100, in_tokens: 10, cache_tokens: 1000 },
      { phase: 'tdd', event: 'completed', ts: 2000, out_tokens: 300, in_tokens: 30, cache_tokens: 3000 },
      { phase: 'simplify', event: 'completed', ts: 3000, out_tokens: 450, in_tokens: 60, cache_tokens: 4500 },
    ]);

    const md = renderTable({ rootDir: root, slug: 's3' });

    assert.match(md, /Tokens \(out\)/, 'headline token column present');
    assert.equal(renderedRow(md, 'run-start'), null, 'baseline is anchor, not a phase row');

    const tdd = renderedRow(md, 'tdd');
    const simplify = renderedRow(md, 'simplify');
    assert.ok(tdd && tdd.includes('200'), 'tdd token delta = 300-100 = 200');
    assert.ok(simplify && simplify.includes('150'), 'simplify token delta = 450-300 = 150');
  });
});

// ---- 4. idempotency --------------------------------------------------------

describe('stampFromWorkflow idempotency with tokens', () => {
  it('test_when_stamp_runs_twice_then_idempotent', () => {
    const root = tmpRoot();
    writeWorkflow(root, { slug: 's4', completed: ['tdd'] });
    const transcriptPath = writeTranscript(root, [{ out: 100, in: 10, cache: 1000 }]);

    stampFromWorkflow({ rootDir: root, now: FIXED_NOW, transcriptPath });
    const afterFirst = readTiming(root, 's4').length;
    stampFromWorkflow({ rootDir: root, now: FIXED_NOW, transcriptPath });
    const afterSecond = readTiming(root, 's4').length;

    assert.equal(afterFirst, 2, 'baseline + one phase row after first stamp');
    assert.equal(afterSecond, afterFirst, 'second stamp appends nothing');
  });
});

// ---- 5. never-throw degradation --------------------------------------------

describe('stampFromWorkflow + renderTable token robustness', () => {
  it('test_when_transcript_missing_or_malformed_then_no_throw_and_tokens_absent', () => {
    // (a) no transcriptPath at all
    const a = tmpRoot();
    writeWorkflow(a, { slug: 'sa', completed: ['tdd'] });
    assert.doesNotThrow(() => stampFromWorkflow({ rootDir: a, now: FIXED_NOW }));
    const aTdd = readTiming(a, 'sa').find((s) => s.phase === 'tdd');
    assert.ok(aTdd, 'time stamp still written without transcript');
    assert.ok(aTdd.out_tokens == null, 'token field absent when no transcript');

    // (b) transcriptPath points at a nonexistent file
    const b = tmpRoot();
    writeWorkflow(b, { slug: 'sb', completed: ['tdd'] });
    assert.doesNotThrow(() =>
      stampFromWorkflow({ rootDir: b, now: FIXED_NOW, transcriptPath: join(b, 'nope.jsonl') }),
    );
    assert.ok(readTiming(b, 'sb').find((s) => s.phase === 'tdd'), 'time stamp written');

    // (c) transcript with a malformed line
    const c = tmpRoot();
    writeWorkflow(c, { slug: 'sc', completed: ['tdd'] });
    const badPath = writeTranscript(c, [{ out: 100, in: 10, cache: 1000 }, 'broken']);
    assert.doesNotThrow(() =>
      stampFromWorkflow({ rootDir: c, now: FIXED_NOW, transcriptPath: badPath }),
    );
    assert.ok(readTiming(c, 'sc').find((s) => s.phase === 'tdd'), 'time stamp written despite bad line');

    // render shows n/a when stamps carry no token data
    const r = tmpRoot();
    writeWorkflow(r, { slug: 'sr', completed: ['tdd'] });
    writeTiming(r, 'sr', [
      { phase: 'run-start', event: 'baseline', ts: 1000 },
      { phase: 'tdd', event: 'completed', ts: 2000 },
    ]);
    const md = renderTable({ rootDir: r, slug: 'sr' });
    const tdd = renderedRow(md, 'tdd');
    assert.ok(tdd && tdd.includes('n/a'), 'token column is n/a when token data absent');
  });
});
