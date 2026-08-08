// Wiring seams for the living-system-model batch.
//
// Provenance: a pre-commit audit found SIX exports across tickets A/B/C/D with no
// caller outside their own tests — a decision-field reader nothing read, an
// invalidation walk nothing walked, a derived index nothing queried, a backfill
// nothing ran, and a ledger nothing wrote. Every one had passed drift at 16/16,
// because `drift_check.mjs` resolves an AC when its id appears in an ADDED line and
// the ids were sitting in test comments.
//
// These tests assert the SEAM, not the unit. A unit test that calls an export
// directly cannot distinguish a wired feature from a well-annotated stub; that is
// precisely how six of them shipped unreachable.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { rmSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { makeProject, writeShard, tryImport } from './helpers/memory-fixtures.mjs';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FLUSH_SKILL = join(REPO_ROOT, '.claude/skills/memory-flush/SKILL.md');

describe('ticket C — the derived index is actually queried', () => {
  it('test_when_governed_surfacing_runs_then_it_resolves_through_the_index', async () => {
    // Spec §Behavior #1: Governed -> Index : resolveLookup(by_path). The first
    // implementation imported matchesGlob and re-scanned resolveCategory itself, so
    // the index that epic decision D8 argued for was unreachable code.
    const src = readFileSync(join(REPO_ROOT, '.claude/hooks/lib/governed-memory.mjs'), 'utf8');
    assert.match(src, /resolveLookup/, 'the surfacing leg must query the derived index, not re-scan the store');

    const project = makeProject();
    try {
      writeShard(project.memDir, 'decisions', 'via-index', {
        key: 'via-index',
        fields: { governs: '.claude/hooks/**', load_bearing: 'true' },
        bodyLines: ['> verbatim: resolved through the index', '', 'Interpretation.'],
      });
      const mod = await tryImport('.claude/hooks/lib/governed-memory.mjs');
      assert.ok(mod, 'governed-memory must import');
      const hits = mod.surfaceGovernedMemory('.claude/hooks/lib/foo.mjs', { rootDir: project.root });
      assert.deepEqual(hits.map((h) => h.key), ['via-index'], 'surfacing still works through the index');
    } finally {
      rmSync(project.root, { recursive: true, force: true });
    }
  });
});

describe('ticket A — load_bearing is read, not just stored', () => {
  it('test_when_a_governed_entry_surfaces_then_it_states_whether_load_bearing', async () => {
    // AC-003 says a decision record STATES whether it is load-bearing. Storing the
    // field satisfies nothing if no reader ever reports it.
    const project = makeProject();
    try {
      writeShard(project.memDir, 'decisions', 'load-bearing-one', {
        key: 'load-bearing-one', fields: { governs: 'src/**', load_bearing: 'true' }, bodyLines: ['- a'],
      });
      writeShard(project.memDir, 'decisions', 'incidental-one', {
        key: 'incidental-one', fields: { governs: 'src/**' }, bodyLines: ['- b'],
      });
      const mod = await tryImport('.claude/hooks/lib/governed-memory.mjs');
      assert.ok(mod, 'governed-memory must import');
      const byKey = Object.fromEntries(
        mod.surfaceGovernedMemory('src/a.js', { rootDir: project.root }).map((h) => [h.key, h]),
      );
      assert.equal(byKey['load-bearing-one'].load_bearing, true, 'an explicit load_bearing: true is reported');
      assert.equal(byKey['incidental-one'].load_bearing, false, 'an omitted field reports false, never undefined');
    } finally {
      rmSync(project.root, { recursive: true, force: true });
    }
  });
});

describe('ticket B — a constraint flip actually surfaces its dependents', () => {
  it('test_when_a_constraint_no_longer_holds_then_session_index_names_the_suspect_decisions', async () => {
    // AC-004's payoff. decisionsRestingOn existed and nothing walked it, so a flipped
    // constraint invalidated nothing anywhere a human would see.
    const project = makeProject();
    try {
      writeShard(project.memDir, 'constraints', 'no-jvm', {
        key: 'no-jvm', fields: { state: 'false', state_verified_at: 'abc1234' }, bodyLines: ['- flipped'],
      });
      writeShard(project.memDir, 'decisions', 'rests-on-jvm', {
        key: 'rests-on-jvm', fields: { rests_on: 'no-jvm' }, bodyLines: ['- depends'],
      });
      writeShard(project.memDir, 'decisions', 'independent', {
        key: 'independent', fields: {}, bodyLines: ['- unrelated'],
      });

      const mod = await tryImport('.claude/hooks/lib/memory_session_start.mjs');
      assert.ok(mod, 'memory_session_start must import');
      const rendered = String(mod.buildIndex({
        memDir: project.memDir, projectRoot: project.root, sessionSource: 'startup',
      }));

      assert.match(rendered, /rests-on-jvm/, 'a decision resting on a flipped constraint is surfaced as suspect');
      assert.match(rendered, /no-jvm/, 'the constraint that flipped is named');
      assert.doesNotMatch(rendered, /independent/, 'a decision that rests on nothing is left alone');
    } finally {
      rmSync(project.root, { recursive: true, force: true });
    }
  });
});

describe('tickets B, C, D — the curation seams are documented in the skill that owns them', () => {
  // These three run inside /memory-flush, which is a prose SOP rather than a code
  // path, so the seam is an instruction plus this assertion that the instruction
  // exists. That is weaker than an exit code and is stated as such in the report:
  // a future run can skip a documented step the same way the /document routing rule
  // was skipped. Recorded rather than overclaimed.
  const seams = [
    ['recordCuration', 'ticket D — a promote/discard decision is written to the ledger'],
    ['writeConstraint', 'ticket B — a promoted constraint goes through the guarded writer'],
    ['assertWritable', 'roadmap T8 — the flush refuses an entry reachable by neither leg'],
  ];

  for (const [symbol, why] of seams) {
    it(`test_when_memory_flush_skill_is_read_then_it_invokes_${symbol}`, () => {
      const text = readFileSync(FLUSH_SKILL, 'utf8');
      assert.match(text, new RegExp(symbol), `${FLUSH_SKILL} must invoke ${symbol} (${why})`);
    });
  }
});
