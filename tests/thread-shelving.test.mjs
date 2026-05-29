// conversation-thread-shelving — lib + fs behavior (AC-1,2,3,4,5,6,7,8,9,11).
//
// Red-phase tests for the durable local conversation-trail + context-switch
// shelving feature. They exercise four not-yet-existing lib helpers via REAL
// temp dirs + fixture transcript JSONL (no internal mocks, per Article VI.3):
//
//   .claude/hooks/lib/thread_store.mjs      — _thread.md / cursor / candidate I/O
//   .claude/hooks/lib/shelve_detect.mjs     — heuristic switch detection + staging
//   .claude/hooks/lib/shelve_capture.mjs    — mechanical span capture + append
//   .claude/hooks/lib/resume_transform.mjs  — TTL cache + readMostRecent
//
// Helpers are imported dynamically inside each test so a missing module fails
// THAT test with a clear error rather than breaking file collection (red).

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync, mkdirSync, writeFileSync, readFileSync, appendFileSync,
  existsSync, symlinkSync, rmSync, readdirSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const LIB = join(REPO_ROOT, '.claude/hooks/lib');
const SWEEP = join(REPO_ROOT, '.claude/skills/memory-flush/sweep.mjs');

const imp = (name) => import(join(LIB, `${name}.mjs`));

// ---- fixtures -------------------------------------------------------------

function seedProject() {
  const root = mkdtempSync(join(tmpdir(), 'thread-shelving-'));
  mkdirSync(join(root, '.claude/memory'), { recursive: true });
  mkdirSync(join(root, '.claude/state'), { recursive: true });
  mkdirSync(join(root, '.claude/hooks'), { recursive: true });
  // Real lib (symlink) so helpers that compose resume_writer/common resolve.
  symlinkSync(LIB, join(root, '.claude/hooks/lib'));
  return root;
}
const memDir = (root) => join(root, '.claude/memory');
const stateDir = (root) => join(root, '.claude/state');

function ev(role, text, uuid) {
  return JSON.stringify({ uuid, message: { role, content: [{ type: 'text', text }] } });
}
function toolEv(name, input, uuid) {
  return JSON.stringify({ uuid, message: { role: 'assistant', content: [{ type: 'tool_use', name, input }] } });
}
function writeTranscript(root, name, lines) {
  const p = join(root, name);
  writeFileSync(p, lines.join('\n') + '\n');
  return p;
}

function sampleEntry(over = {}) {
  return {
    shelved_at: '2026-05-30T10:00:00Z',
    trigger: 'auto',
    span_start_uuid: 'u1',
    span_end_uuid: 'u9',
    verbatim_cues: ['user wants single rolling trail', 'transform at resume'],
    open_question_candidates: ['bounding policy?'],
    in_flight_files: ['docs/specs/x.md'],
    next_step: 'write the lib helpers',
    ...over,
  };
}

// ---- AC-1: durability across /memory-flush --------------------------------

describe('AC-1 trail survives /memory-flush sweep', () => {
  it('test_when_memory_flush_runs_then_thread_md_unchanged', () => {
    const root = seedProject();
    try {
      const md = memDir(root);
      const threadPath = join(md, '_thread.md');
      const body = '# Conversation thread trail\n\n## SHELVED 2026-05-30\n> cue\n';
      writeFileSync(threadPath, body);
      // canonical files sweep.mjs iterates must exist so the sweep runs.
      for (const f of ['landmarks', 'libraries', 'decisions', 'landmines', 'conventions', 'pending-questions', 'backlog']) {
        writeFileSync(join(md, `${f}.md`), `---\nsize-cap: 500\n---\n\n# ${f}\n`);
      }
      const before = readFileSync(threadPath, 'utf8');
      for (const mode of ['auto-close', 'stale', 'backlog-decay']) {
        spawnSync('node', [SWEEP, '--mode', mode, '--memory-dir', md], { encoding: 'utf8' });
      }
      assert.equal(readFileSync(threadPath, 'utf8'), before, '_thread.md must be byte-unchanged after sweep');
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
});

// ---- AC-2: gitignored content, tracked template ---------------------------

describe('AC-2 trail content gitignored, template tracked', () => {
  it('test_when_committing_then_thread_md_gitignored_and_template_tracked', () => {
    const gi = readFileSync(join(REPO_ROOT, '.gitignore'), 'utf8');
    assert.match(gi, /^\.claude\/memory\/_thread\.md$/m, '.gitignore must ignore .claude/memory/_thread.md');
    assert.equal(/^src\/memory\/_thread\.template\.md$/m.test(gi), false, 'template must NOT be gitignored');
  });
});

// ---- AC-3: mechanical shelve appends a 4-bucket entry, no summary ---------

describe('AC-3 shelve appends mechanical capture (no model summary)', () => {
  it('test_when_shelve_runs_then_entry_has_four_buckets_no_summary', async () => {
    const sc = await imp('shelve_capture');
    const ts = await imp('thread_store');
    const root = seedProject();
    try {
      const t = writeTranscript(root, 't.jsonl', [
        ev('user', 'lets build the trail feature', 'u1'),
        toolEv('Write', { file_path: 'docs/specs/x.md' }, 'u2'),
        ev('assistant', 'wrote the spec', 'u3'),
      ]);
      ts.writeCursor({ stateDir: stateDir(root), cursor: { transcript_path: t, last_event_uuid: null, timestamp: null } });
      const entry = await sc.capture({ transcriptPath: t, memDir: memDir(root), stateDir: stateDir(root), end: { type: 'now' } });
      for (const k of ['verbatim_cues', 'open_question_candidates', 'in_flight_files', 'next_step']) {
        assert.ok(k in entry, `entry must carry bucket ${k}`);
      }
      assert.equal('summary' in entry, false, 'mechanical shelve must NOT produce a model summary (deferred to resume per D2)');
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
});

// ---- AC-4: detector stages, no control-flow decision ----------------------

describe('AC-4 detector stages candidate, emits no stdout decision', () => {
  it('test_when_detector_finds_switch_then_stages_candidate_and_no_stdout', async () => {
    const sd = await imp('shelve_detect');
    const ts = await imp('thread_store');
    const root = seedProject();
    try {
      const t = writeTranscript(root, 't.jsonl', [
        ev('user', 'lets finish the memory trail feature', 'u1'),
        ev('assistant', 'working on trail', 'u2'),
        ev('user', 'actually urgent: the deploy pipeline is broken, drop everything', 'u3'),
      ]);
      const out = sd.detect({ transcriptPath: t, prevSubject: 'memory trail feature', cursor: { last_event_uuid: 'u1' }, stateDir: stateDir(root) });
      // returns a plain detection result, NOT a hook control-flow decision object.
      assert.equal(out && typeof out === 'object' && 'decision' in out, false, 'detector must NOT return a control-flow {decision} object');
      const cand = ts.readCandidate({ stateDir: stateDir(root) });
      assert.ok(cand && cand.detected === true, 'a switch candidate must be staged on divergence');
      assert.ok(typeof cand.boundary_event_uuid === 'string' && cand.boundary_event_uuid.length, 'candidate must carry boundary_event_uuid');
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it('test_when_memory_stop_runs_then_no_stdout_decision', () => {
    // The folded detector must not make memory_stop emit a stdout decision —
    // harness_continuation owns the only Stop-event block decision.
    const root = seedProject();
    try {
      writeFileSync(join(memDir(root), '_pending.md'), '---\nverifies-against: none\n---\n\n# Pending\n\n---\n');
      const t = writeTranscript(root, 't.jsonl', [ev('user', 'hello', 'u1'), toolEv('Write', { file_path: 'src/a.js' }, 'u2')]);
      const r = spawnSync('node', [join(REPO_ROOT, '.claude/hooks/memory_stop.mjs')], {
        env: { ...process.env, CLAUDE_PROJECT_DIR: root, CLAUDE_PROJECT_ROOT: root },
        input: JSON.stringify({ transcript_path: t }), encoding: 'utf8',
      });
      assert.equal(r.status, 0, `memory_stop must exit 0: ${r.stderr}`);
      assert.equal((r.stdout || '').trim(), '', `memory_stop must emit no stdout decision; got: ${r.stdout}`);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
});

// ---- AC-5: resume surfaces the four buckets -------------------------------

describe('AC-5 resume reads most-recent verbatim for transform', () => {
  it('test_when_resume_runs_then_surfaces_four_buckets_from_verbatim', async () => {
    const rt = await imp('resume_transform');
    const ts = await imp('thread_store');
    const root = seedProject();
    try {
      ts.appendEntry({ memDir: memDir(root), entry: sampleEntry({ next_step: 'first' }) });
      ts.appendEntry({ memDir: memDir(root), entry: sampleEntry({ next_step: 'second', shelved_at: '2026-05-30T12:00:00Z' }) });
      const latest = rt.readMostRecent({ memDir: memDir(root) });
      assert.equal(latest.next_step, 'second', 'must return the most-recent section');
      for (const k of ['verbatim_cues', 'open_question_candidates', 'in_flight_files', 'next_step']) {
        assert.ok(k in latest, `surfaced entry must carry ${k}`);
      }
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
});

// ---- AC-6: single rolling trail -------------------------------------------

describe('AC-6 single rolling trail (append, one file)', () => {
  it('test_when_multiple_shelves_then_single_rolling_file_appended', async () => {
    const ts = await imp('thread_store');
    const root = seedProject();
    try {
      ts.appendEntry({ memDir: memDir(root), entry: sampleEntry({ next_step: 'a' }) });
      ts.appendEntry({ memDir: memDir(root), entry: sampleEntry({ next_step: 'b' }) });
      assert.ok(existsSync(join(memDir(root), '_thread.md')), 'one _thread.md file');
      assert.equal(existsSync(join(memDir(root), 'threads')), false, 'no per-thread directory');
      const sections = ts.listSections({ memDir: memDir(root) });
      assert.equal(sections.length, 2, 'two appended sections in one file');
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
});

// ---- AC-7: verbatim cue byte round-trip -----------------------------------

describe('AC-7 verbatim cues preserved literally', () => {
  it('test_when_verbatim_cue_roundtrips_then_bytes_identical', async () => {
    const ts = await imp('thread_store');
    const root = seedProject();
    try {
      const cue = 'Engineer: "harness means claude-code" — em-dash, `code`, 中文, emoji 🚀';
      ts.appendEntry({ memDir: memDir(root), entry: sampleEntry({ verbatim_cues: [cue] }) });
      const latest = ts.readMostRecent({ memDir: memDir(root) });
      assert.equal(latest.verbatim_cues[0], cue, 'verbatim cue must round-trip byte-identical');
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it('test_when_cue_contains_comment_delimiter_then_entry_still_round_trips', async () => {
    // CWE-116 regression: a cue containing the data-block delimiter `-->` (or
    // its opener) must not truncate the entry on read.
    const ts = await imp('thread_store');
    const root = seedProject();
    try {
      const cue = 'tricky: closes a comment --> and opens <!-- thread-entry too';
      ts.appendEntry({ memDir: memDir(root), entry: sampleEntry({ verbatim_cues: [cue], next_step: 'survives' }) });
      const latest = ts.readMostRecent({ memDir: memDir(root) });
      assert.ok(latest, 'entry must not be dropped when a cue contains the delimiter');
      assert.equal(latest.verbatim_cues[0], cue, 'delimiter-bearing cue must round-trip byte-identical');
      assert.equal(latest.next_step, 'survives');
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
});

// ---- AC-8: cursor window [cursor..end] + advance + fallback ---------------

describe('AC-8 capture window is [cursor..end], cursor advances', () => {
  it('test_when_shelve_then_span_is_cursor_to_end_and_cursor_advances', async () => {
    const sc = await imp('shelve_capture');
    const ts = await imp('thread_store');
    const root = seedProject();
    try {
      const t = writeTranscript(root, 't.jsonl', [
        ev('user', 'A: prior thread already shelved', 'u1'),
        ev('user', 'B: current thread start', 'u2'),
        ev('assistant', 'mid', 'u3'),
        ev('user', 'C: switch point', 'u4'),
        ev('user', 'D: new topic (excluded)', 'u5'),
      ]);
      ts.writeCursor({ stateDir: stateDir(root), cursor: { transcript_path: t, last_event_uuid: 'u1', timestamp: null } });
      const entry = await sc.capture({ transcriptPath: t, memDir: memDir(root), stateDir: stateDir(root), end: { type: 'uuid', uuid: 'u4' } });
      assert.equal(entry.span_start_uuid, 'u1', 'span starts at cursor');
      assert.equal(entry.span_end_uuid, 'u4', 'span ends at staged switch-point, excluding later turns');
      const cur = ts.readCursor({ stateDir: stateDir(root) });
      assert.equal(cur.last_event_uuid, 'u4', 'cursor advances to end after shelve');
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it('test_when_transcript_path_mismatch_then_whole_transcript_fallback', async () => {
    const sc = await imp('shelve_capture');
    const ts = await imp('thread_store');
    const root = seedProject();
    try {
      const t = writeTranscript(root, 'current.jsonl', [ev('user', 'only turn', 'z1')]);
      ts.writeCursor({ stateDir: stateDir(root), cursor: { transcript_path: '/old/session.jsonl', last_event_uuid: 'old9', timestamp: null } });
      const entry = await sc.capture({ transcriptPath: t, memDir: memDir(root), stateDir: stateDir(root), end: { type: 'now' } });
      assert.equal(entry.span_start_uuid, null, 'cross-session mismatch falls back to whole current transcript (no start uuid)');
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
});

// ---- AC-9: session-start injects most-recent only, within envelope --------

describe('AC-9 SessionStart injects most-recent section within envelope', () => {
  it('test_when_session_starts_then_only_most_recent_section_injected_within_envelope', async () => {
    const mss = await imp('memory_session_start');
    const ts = await imp('thread_store');
    const root = seedProject();
    try {
      // two large sections; only the most-recent (marker 'NEWER') should inject.
      ts.appendEntry({ memDir: memDir(root), entry: sampleEntry({ next_step: 'OLDER ' + 'x'.repeat(4000), shelved_at: '2026-05-30T09:00:00Z' }) });
      ts.appendEntry({ memDir: memDir(root), entry: sampleEntry({ next_step: 'NEWER ' + 'y'.repeat(4000), shelved_at: '2026-05-30T11:00:00Z' }) });
      const env = mss.buildIndex({ memDir: memDir(root), projectRoot: root, sessionSource: 'startup' });
      const text = typeof env === 'string' ? env : JSON.stringify(env);
      assert.ok(text.includes('NEWER'), 'most-recent thread section must be injected');
      assert.equal(text.includes('OLDER'), false, 'older sections must NOT be injected (bounded read)');
      assert.ok(text.length <= 10 * 1024, `injection must stay within ~10KB envelope; got ${text.length}`);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
});

// ---- AC-11: resume transform TTL cache ------------------------------------

describe('AC-11 resume transform TTL cache', () => {
  it('test_when_resume_cache_fresh_then_served_else_recomputed', async () => {
    const rt = await imp('resume_transform');
    const root = seedProject();
    try {
      const sd = stateDir(root);
      const now = 1_000_000_000_000;
      const ttl = 86400; // seconds
      rt.writeCache({ stateDir: sd, summary: 'cached summary', sourceShelvedAt: '2026-05-30T11:00:00Z', nowMs: now });
      const fresh = rt.readCache({ stateDir: sd, ttlSeconds: ttl, nowMs: now + 1000 });
      assert.equal(fresh.hit, true, 'fresh cache within TTL must hit');
      assert.equal(fresh.summary, 'cached summary');
      const expired = rt.readCache({ stateDir: sd, ttlSeconds: ttl, nowMs: now + (ttl + 10) * 1000 });
      assert.equal(expired.hit, false, 'expired cache must miss (recompute)');
      rmSync(join(sd, 'thread_transform_cache.json'), { force: true });
      const absent = rt.readCache({ stateDir: sd, ttlSeconds: ttl, nowMs: now });
      assert.equal(absent.hit, false, 'absent cache must miss (recompute)');
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
});
