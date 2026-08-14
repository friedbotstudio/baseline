// Ticket read-front-door-sweep — T-005 (AC-002).
//
// gather.mjs's collectRoadmap must delegate to roadmap/parse.mjs's parseRoadmap
// instead of running its own local emoji parser, while the recap's PUBLIC shape
// stays byte-identical to what it was before the extraction: `epics[n].tasks` is
// still the {done,inProgress,planned} TALLY object (parse.mjs calls that `tally`
// and uses `tasks` for the row array — the projection must not leak the row
// array into the recap), and epic status keeps its pre-extraction hyphenated
// spelling ('in-progress'), not parse.mjs's Status enum spelling ('in_progress').

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { REPO_ROOT, makeProject, readFileSync } from './helpers/memory-fixtures.mjs';

const GATHER_PATH = join(REPO_ROOT, '.claude/skills/standup/gather.mjs');
const DEFAULT_ROADMAP_PATH = 'docs/roadmap-execution-plan.md';

async function loadGather() {
  const mod = await import(GATHER_PATH);
  return mod.gatherSync;
}

function writeFile(root, relPath, content) {
  const path = join(root, relPath);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, 'utf8');
  return path;
}

function writeRoadmap(root, content, relPath = DEFAULT_ROADMAP_PATH) {
  return writeFile(root, relPath, content);
}

describe('T-005 — collectRoadmap delegates to parse.mjs, recap keeps its own shape (AC-002)', () => {
  it('test_when_recap_gathered_then_roadmap_key_keeps_the_tally_shape', async () => {
    const gatherSync = await loadGather();
    const { root } = makeProject();
    writeRoadmap(
      root,
      [
        '## Epic 1 — Alpha ✅ (alpha)',
        '',
        '- ✅ T1. Done one.',
        '- ⬜ T2. Planned one.',
        '',
      ].join('\n'),
    );

    const recap = gatherSync({ rootDir: root });

    assert.ok(recap.roadmap, 'a present roadmap file must yield a roadmap object');
    const epic = recap.roadmap.epics[0];
    assert.ok(epic, 'expected epic 1');
    assert.equal(typeof epic.tasks, 'object');
    assert.ok(!Array.isArray(epic.tasks), 'epic.tasks must be the tally OBJECT, not the row array');
    assert.deepEqual(epic.tasks, { done: 1, inProgress: 0, planned: 1 });
  });

  it('test_when_recap_gathered_on_live_repo_then_epic_and_tally_values_are_unchanged', async () => {
    const gatherSync = await loadGather();

    const recap = gatherSync({ rootDir: REPO_ROOT });

    assert.ok(recap.roadmap, 'the live repo has a roadmap plan');
    assert.equal(recap.roadmap.epics.length, 7, 'live repo must still yield 7 epics');
    const epic6 = recap.roadmap.epics.find((e) => e.num === 6);
    assert.ok(epic6, 'expected Epic 6');
    // Epic 6 closed at c92f82a, the T11 landing: /roadmap-sync flipped the last
    // planned row (T11) to done, which promoted the epic heading 🟡 -> ✅. These
    // are live-repo values by design, so they move when the roadmap moves —
    // re-measure against `roadmap/cli.mjs epics`, do not defend the old numbers.
    assert.equal(epic6.status, 'done');
    assert.deepEqual(epic6.tasks, { done: 11, inProgress: 0, planned: 0 });
    assert.equal(recap.roadmap.progress.length, 8, 'live repo must still yield 8 progress bullets');
  });

  it('test_when_gather_source_read_then_no_roadmap_parser_remains', () => {
    const src = readFileSync(GATHER_PATH, 'utf8');
    for (const dead of ['countTaskStatuses', 'parseEpicHeading', 'statusFromEmoji', 'STATUS_BY_EMOJI', 'roadmapPathFor']) {
      assert.ok(!src.includes(dead), `gather.mjs must no longer contain the local roadmap parser \`${dead}\``);
    }
  });

  it('test_when_roadmap_absent_then_degraded_marker_still_recorded', async () => {
    const gatherSync = await loadGather();
    const { root } = makeProject();

    const recap = gatherSync({ rootDir: root });

    assert.equal(recap.roadmap, null, 'a project with no roadmap file must yield roadmap: null');
    assert.ok(recap.degraded.includes('no-roadmap-plan'), 'degraded must still name no-roadmap-plan');
  });

  it('test_when_epic_status_read_then_hyphenated_form_is_preserved', async () => {
    const gatherSync = await loadGather();
    const { root } = makeProject();
    writeRoadmap(
      root,
      [
        '## Epic 1 — Beta 🟡 (beta)',
        '',
        '- 🟡 T1. In flight.',
        '',
      ].join('\n'),
    );

    const recap = gatherSync({ rootDir: root });

    const epic = recap.roadmap.epics[0];
    assert.equal(epic.status, 'in-progress', "the recap must keep its own spelling ('in-progress'), not parse.mjs's Status enum spelling ('in_progress')");
  });
});
