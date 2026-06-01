// Roll-off cap for the durable local conversation trail (`_thread.md`).
//
// The trail is appended one section per shelve and is OUTSIDE /memory-flush's
// reset path by design, so without a cap it grows unbounded. These tests drive
// a count-based roll-off (`pruneTrail` + a default cap, applied from inside
// `appendEntry`) that evicts the oldest sections while keeping the most-recent
// ones byte-intact. Real temp dirs, no internal mocks (Article VI.3).
//
// thread_store is imported dynamically so a missing export fails THAT test with
// a clear error rather than breaking file collection (red phase).

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, existsSync, symlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const LIB = join(REPO_ROOT, '.claude/hooks/lib');
const imp = () => import(join(LIB, 'thread_store.mjs'));

function seedMemDir() {
  const root = mkdtempSync(join(tmpdir(), 'thread-rolloff-'));
  mkdirSync(join(root, '.claude/memory'), { recursive: true });
  mkdirSync(join(root, '.claude/hooks'), { recursive: true });
  symlinkSync(LIB, join(root, '.claude/hooks/lib'));
  return join(root, '.claude/memory');
}

// Build a real entry object matching the shape thread_store renders/parses.
function entry(n) {
  return {
    shelved_at: `2026-06-01T0${n % 10}:00:00Z`,
    trigger: 'model',
    span_start_uuid: `start-${n}`,
    span_end_uuid: `end-${n}`,
    verbatim_cues: [`cue for shelve ${n} -->with delimiter`],
    open_question_candidates: [`oq ${n}`],
    in_flight_files: [`file-${n}.mjs`],
    next_step: `next step ${n}`,
  };
}

async function appendN(mod, memDir, count, maxSections) {
  for (let i = 1; i <= count; i++) {
    mod.appendEntry({ memDir, entry: entry(i), maxSections });
  }
}

describe('thread-trail roll-off cap', () => {
  it('test_when_sections_under_cap_then_no_eviction', async () => {
    const mod = await imp();
    const memDir = seedMemDir();
    try {
      await appendN(mod, memDir, 3, 5);
      assert.equal(mod.listSections({ memDir }).length, 3);
      const text = readFileSync(join(memDir, '_thread.md'), 'utf8');
      assert.match(text, /# Conversation thread trail/);
    } finally {
      rmSync(dirname(dirname(memDir)), { recursive: true, force: true });
    }
  });

  it('test_when_sections_exceed_cap_then_oldest_evicted', async () => {
    const mod = await imp();
    const memDir = seedMemDir();
    try {
      await appendN(mod, memDir, 8, 5); // cap 5, append 8 -> evict oldest 3
      const sections = mod.listSections({ memDir });
      assert.equal(sections.length, 5, 'should retain exactly the cap');
      // survivors are the most-recent (entries 4..8); 1..3 evicted.
      assert.deepEqual(sections.map((s) => s.span_start_uuid), ['start-4', 'start-5', 'start-6', 'start-7', 'start-8']);
      assert.match(readFileSync(join(memDir, '_thread.md'), 'utf8'), /# Conversation thread trail/);
    } finally {
      rmSync(dirname(dirname(memDir)), { recursive: true, force: true });
    }
  });

  it('test_when_pruned_then_most_recent_intact_and_parseable', async () => {
    const mod = await imp();
    const memDir = seedMemDir();
    try {
      await appendN(mod, memDir, 8, 5);
      const last = mod.readMostRecent({ memDir });
      assert.deepEqual(last, entry(8), 'most-recent entry must round-trip byte-identical after eviction');
      const sections = mod.listSections({ memDir });
      assert.equal(sections.length, 5);
      assert.deepEqual(sections.map((s) => s.next_step), ['next step 4', 'next step 5', 'next step 6', 'next step 7', 'next step 8']);
    } finally {
      rmSync(dirname(dirname(memDir)), { recursive: true, force: true });
    }
  });

  it('test_when_readMostRecentMarkdown_after_eviction_then_returns_last_section', async () => {
    const mod = await imp();
    const memDir = seedMemDir();
    try {
      await appendN(mod, memDir, 8, 5);
      const md = mod.readMostRecentMarkdown({ memDir });
      assert.equal((md.match(/^## SHELVED /gm) || []).length, 1, 'exactly one section returned');
      assert.match(md, /span:start-8\.\.end-8/);
    } finally {
      rmSync(dirname(dirname(memDir)), { recursive: true, force: true });
    }
  });

  it('test_when_exactly_at_cap_then_no_eviction', async () => {
    const mod = await imp();
    const memDir = seedMemDir();
    try {
      await appendN(mod, memDir, 5, 5);
      assert.equal(mod.listSections({ memDir }).length, 5);
    } finally {
      rmSync(dirname(dirname(memDir)), { recursive: true, force: true });
    }
  });

  it('test_when_phantom_heading_in_cue_then_no_wrongful_eviction', async () => {
    // A verbatim cue can be multi-line; only its first line gets the `> ` prefix,
    // so a later line beginning "## SHELVED " is a bare line that a heading-based
    // eviction would miscount as a section boundary. Eviction must key off the
    // forge-proof base64 data block, not the heading, so a phantom never drops a
    // section that should survive.
    const mod = await imp();
    const memDir = seedMemDir();
    try {
      const phantom = { ...entry(1), verbatim_cues: ['code review:\n## SHELVED phantom in a surviving section'] };
      mod.appendEntry({ memDir, entry: phantom, maxSections: 3 });
      mod.appendEntry({ memDir, entry: entry(2), maxSections: 3 });
      mod.appendEntry({ memDir, entry: entry(3), maxSections: 3 }); // 3 real, cap 3 -> no eviction
      const sections = mod.listSections({ memDir });
      assert.equal(sections.length, 3, 'a phantom heading in a cue must not trigger eviction');
      assert.ok(sections.some((s) => s.span_start_uuid === 'start-1'), 'section 1 must survive');
    } finally {
      rmSync(dirname(dirname(memDir)), { recursive: true, force: true });
    }
  });

  it('test_when_pruneTrail_on_missing_file_then_noop', async () => {
    const mod = await imp();
    const memDir = seedMemDir();
    try {
      const res = mod.pruneTrail({ memDir, maxSections: 5 });
      assert.deepEqual(res, { kept: 0, evicted: 0 });
      assert.equal(existsSync(join(memDir, '_thread.md')), false, 'prune must not create the file');
    } finally {
      rmSync(dirname(dirname(memDir)), { recursive: true, force: true });
    }
  });
});
