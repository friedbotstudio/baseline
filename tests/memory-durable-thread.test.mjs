// Tier 3 — durable pinned working thread + _resume rework.
// Spec: docs/specs/memory-capture-tier2-tier3.md (§Behavior #3).
// Covers AC-004, AC-014.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { appendEntry, pruneTrail, listSections } from '../.claude/hooks/lib/thread_store.mjs';
import { writeSnapshot } from '../.claude/hooks/lib/resume_writer.mjs';
import { makeProject, writeTranscript, tryImport } from './helpers/memory-fixtures.mjs';

function entryOf(overrides) {
  return {
    shelved_at: '2026-06-04T00:00:00Z',
    trigger: 'auto',
    span_start_uuid: null,
    span_end_uuid: null,
    verbatim_cues: [],
    open_question_candidates: [],
    in_flight_files: [],
    next_step: '(none)',
    ...overrides,
  };
}

describe('Tier 3 — durable pinned working thread', () => {
  it('test_when_work_then_clear_then_pinned_working_thread_surfaced', async () => {
    const { memDir } = makeProject();
    appendEntry({ memDir, entry: entryOf({ trigger: 'working', working_thread: true, next_step: 'finish tier 3', verbatim_cues: ['what/why: building tier 3'] }) });
    const mod = await tryImport('.claude/hooks/lib/thread_store.mjs');
    assert.equal(typeof mod.readWorkingThread, 'function', 'thread_store must export readWorkingThread()');
    const wt = mod.readWorkingThread({ memDir });
    assert.ok(wt && wt.working_thread === true, 'pinned working thread is surfaced after /clear');
  });

  it('test_when_over_20_sections_with_working_thread_then_not_evicted', () => {
    const { memDir } = makeProject();
    // Pin first, then bury it under more than the 20-section cap of ordinary entries.
    appendEntry({ memDir, entry: entryOf({ trigger: 'working', working_thread: true, next_step: 'PINNED' }) });
    for (let i = 0; i < 25; i++) {
      appendEntry({ memDir, entry: entryOf({ next_step: `ordinary ${i}` }) });
    }
    pruneTrail({ memDir, maxSections: 20 });
    const survived = listSections({ memDir }).some((s) => s.working_thread === true);
    assert.ok(survived, 'pinned working thread must not be evicted by the 20-section prune');
  });

  it('test_when_resume_reworked_then_per_turn_snapshot_kept_and_distilled_to_pinned_thread', () => {
    const proj = makeProject();
    const transcript = writeTranscript(proj.root, ['We need to finish tier 3 of the memory epoch.']);
    writeSnapshot({ transcript, projectDir: proj.root, trigger: 'stop' });
    assert.ok(existsSync(join(proj.memDir, '_resume.md')), 'per-turn _resume snapshot still written');
    const hasWorking = listSections({ memDir: proj.memDir }).some((s) => s.working_thread === true);
    assert.ok(hasWorking, 'resume rework distills a pinned working_thread entry into _thread.md');
  });
});
