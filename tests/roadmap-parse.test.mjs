// Ticket read-front-door-sweep — T-003 (AC-001, AC-003).
//
// AC-001 defends the RoadmapPlan/RoadmapEpic/RoadmapTask data model: task rows
// carry id, epicNum, status, title, body, and a missing plan file degrades to
// null rather than throwing. AC-003 defends the read side of the front-door
// sweep — the tally comes from parsed task ROWS, never from an emoji count over
// the whole epic body, so a narrative mention of a status emoji cannot inflate
// or deflate it.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { makeProject, tryImport } from './helpers/memory-fixtures.mjs';

const PARSE = '.claude/skills/roadmap/parse.mjs';
const DEFAULT_ROADMAP_PATH = 'docs/roadmap-execution-plan.md';

function writeFile(root, relPath, content) {
  const path = join(root, relPath);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, 'utf8');
  return path;
}

function writeRoadmap(root, content, relPath = DEFAULT_ROADMAP_PATH) {
  return writeFile(root, relPath, content);
}

function writeProjectJson(root, raw) {
  return writeFile(root, '.claude/project.json', raw);
}

describe('T-003 — parseRoadmap: task rows carry id/epicNum/status/title (AC-001)', () => {
  it('test_when_plan_has_epics_and_tasks_then_rows_carry_id_status_title_and_epic', async () => {
    const parse = await tryImport(PARSE);
    assert.ok(parse, `${PARSE} does not exist yet`);
    const { root } = makeProject();
    writeRoadmap(
      root,
      [
        '# Test roadmap',
        '',
        '## Epic 1 — Alpha ✅ (alpha)',
        '',
        '- ✅ T1. First task done.',
        '- ⬜ T2. Second task planned.',
        '',
        '## Epic 2 — Beta 🟡 (beta)',
        '',
        '- 🟡 T3. Third task in progress.',
        '',
      ].join('\n'),
    );

    const plan = parse.parseRoadmap(root);
    assert.ok(plan, 'a present roadmap file must parse');
    assert.equal(plan.epics.length, 2);

    const [epic1, epic2] = plan.epics;
    assert.deepEqual(
      epic1.tasks.map((t) => ({ id: t.id, epicNum: t.epicNum, status: t.status, title: t.title })),
      [
        { id: 'T1', epicNum: 1, status: 'done', title: 'First task done.' },
        { id: 'T2', epicNum: 1, status: 'planned', title: 'Second task planned.' },
      ],
    );
    assert.deepEqual(
      epic2.tasks.map((t) => ({ id: t.id, epicNum: t.epicNum, status: t.status, title: t.title })),
      [{ id: 'T3', epicNum: 2, status: 'in-progress', title: 'Third task in progress.' }],
    );
    for (const epic of plan.epics) {
      for (const task of epic.tasks) {
        assert.ok('body' in task, 'every task must carry a body field');
      }
    }
  });
});

describe('T-003 — parseRoadmap: tally reads the row marker, not a prose emoji count (AC-003)', () => {
  it('test_when_epic_prose_mentions_a_status_emoji_then_tally_is_unchanged', async () => {
    const parse = await tryImport(PARSE);
    assert.ok(parse, `${PARSE} does not exist yet`);

    const body = [
      '## Epic 1 — Alpha ✅ (alpha)',
      '',
      '{{NARRATIVE}}',
      '',
      '- ✅ T1. Done task.',
      '- ⬜ T2. Planned task.',
      '',
    ].join('\n');

    const without = makeProject();
    writeRoadmap(without.root, body.replace('{{NARRATIVE}}', 'Some narrative text without any emoji.'));
    const planWithout = parse.parseRoadmap(without.root);

    const withEmoji = makeProject();
    writeRoadmap(withEmoji.root, body.replace('{{NARRATIVE}}', 'Some narrative text mentioning ✅ inline for flavor.'));
    const planWith = parse.parseRoadmap(withEmoji.root);

    assert.deepEqual(
      planWith.epics[0].tally,
      planWithout.epics[0].tally,
      'a prose mention of a status emoji outside a task row must not move the tally',
    );
    assert.deepEqual(planWithout.epics[0].tally, { done: 1, inProgress: 0, planned: 1 });
  });

  it('test_when_tally_computed_then_it_equals_the_row_counts_by_status', async () => {
    const parse = await tryImport(PARSE);
    assert.ok(parse, `${PARSE} does not exist yet`);
    const { root } = makeProject();
    writeRoadmap(
      root,
      [
        '## Epic 1 — Mixed 🟡 (mixed)',
        '',
        '- ✅ T1. Done one.',
        '- ✅ T2. Done two.',
        '- 🟡 T3. In progress one.',
        '- ⬜ T4. Planned one.',
        '- ⬜ T5. Planned two.',
        '- ⬜ T6. Planned three.',
        '',
      ].join('\n'),
    );

    const plan = parse.parseRoadmap(root);
    const epic = plan.epics[0];
    const rowCounts = epic.tasks.reduce(
      (acc, t) => ({ ...acc, [t.status]: (acc[t.status] || 0) + 1 }),
      {},
    );
    assert.equal(epic.tally.done, rowCounts.done || 0);
    assert.equal(epic.tally.inProgress, rowCounts['in-progress'] || 0);
    assert.equal(epic.tally.planned, rowCounts.planned || 0);
    assert.deepEqual(epic.tally, { done: 2, inProgress: 1, planned: 3 });
  });
});

describe('T-003 — parseRoadmap: fail-soft on a missing plan (AC-001)', () => {
  it('test_when_roadmap_file_absent_then_parse_returns_null_and_does_not_throw', async () => {
    const parse = await tryImport(PARSE);
    assert.ok(parse, `${PARSE} does not exist yet`);
    const { root } = makeProject();

    let plan;
    assert.doesNotThrow(() => {
      plan = parse.parseRoadmap(root);
    });
    assert.equal(plan, null);
  });
});

describe('T-003 — roadmapPathFor: project.json resolution is lenient (AC-001)', () => {
  it('test_when_project_json_declares_roadmap_path_then_that_path_is_used', async () => {
    const parse = await tryImport(PARSE);
    assert.ok(parse, `${PARSE} does not exist yet`);

    const declared = makeProject();
    writeProjectJson(declared.root, JSON.stringify({ roadmap: { path: 'docs/custom-roadmap.md' } }));
    writeRoadmap(declared.root, '## Epic 1 — Alpha ✅ (alpha)\n\n- ✅ T1. Done.\n', 'docs/custom-roadmap.md');
    assert.equal(parse.roadmapPathFor(declared.root), 'docs/custom-roadmap.md');
    const declaredPlan = parse.parseRoadmap(declared.root);
    assert.ok(declaredPlan, 'the declared path must be the one actually read');
    assert.equal(declaredPlan.path, 'docs/custom-roadmap.md');
    assert.equal(declaredPlan.epics.length, 1);

    const absent = makeProject();
    assert.equal(parse.roadmapPathFor(absent.root), DEFAULT_ROADMAP_PATH);

    const malformed = makeProject();
    writeProjectJson(malformed.root, '{ not valid json');
    assert.equal(parse.roadmapPathFor(malformed.root), DEFAULT_ROADMAP_PATH);
  });
});

describe('T-003 — parseRoadmap: Progress bullets (AC-001)', () => {
  it('test_when_plan_has_progress_section_then_bullets_are_captured', async () => {
    const parse = await tryImport(PARSE);
    assert.ok(parse, `${PARSE} does not exist yet`);
    const { root } = makeProject();
    writeRoadmap(
      root,
      [
        '## Progress',
        '',
        '- **Status (2026-08-09):** Something happened.',
        '- Another bullet without bold.',
        '',
        '## Epic 1 — Alpha ✅ (alpha)',
        '',
        '- ✅ T1. Task one.',
        '',
      ].join('\n'),
    );

    const plan = parse.parseRoadmap(root);
    assert.deepEqual(plan.progress, [
      'Status (2026-08-09): Something happened.',
      'Another bullet without bold.',
    ]);
  });
});

describe('T-003 — parseRoadmap: empty and epic-less plans (AC-001)', () => {
  it('test_when_roadmap_is_empty_or_headings_only_then_epics_is_empty_and_no_throw', async () => {
    const parse = await tryImport(PARSE);
    assert.ok(parse, `${PARSE} does not exist yet`);

    const empty = makeProject();
    writeRoadmap(empty.root, '');
    let emptyPlan;
    assert.doesNotThrow(() => {
      emptyPlan = parse.parseRoadmap(empty.root);
    });
    assert.deepEqual(emptyPlan.epics, []);

    const headingsOnly = makeProject();
    writeRoadmap(headingsOnly.root, '## Progress\n\n- Nothing epic-shaped here.\n');
    let headingsPlan;
    assert.doesNotThrow(() => {
      headingsPlan = parse.parseRoadmap(headingsOnly.root);
    });
    assert.deepEqual(headingsPlan.epics, []);
  });
});
