// AC-001 through AC-005 — the roadmap view, rendered from a plan.
//
// Every assertion here runs against an in-memory RoadmapPlan. The renderer reads
// no file, no git and no clock, so a fixture is the whole input and the same plan
// always renders the same lines.
//
// The deliberate divergence from standup: open rows never collapse to a count at
// any plan size. standup bounds them because the recap answers six questions and
// the roadmap is one of them; this command answers only that one, so collapsing
// what it exists to show would leave nothing.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { tryImport } from './helpers/memory-fixtures.mjs';

const RENDER = '.claude/skills/roadmap/render.mjs';

const DONE = '✅';
const IN_PROGRESS = '🟡';
const PLANNED = '⬜';

function task(id, epicNum, status, title) {
  return { id, epicNum, status, title, body: title };
}

function epic(num, title, rows, { tag = null } = {}) {
  const tally = {
    done: rows.filter((r) => r.status === 'done').length,
    inProgress: rows.filter((r) => r.status === 'in-progress').length,
    planned: rows.filter((r) => r.status === 'planned').length,
  };
  const status = tally.planned + tally.inProgress === 0
    ? 'done'
    : tally.done > 0 ? 'in-progress' : 'planned';
  return { num, title, tag, status, tasks: rows, tally };
}

function doneEpic(num, title, howMany = 3) {
  return epic(num, title, Array.from({ length: howMany }, (_, i) =>
    task(String.fromCharCode(65 + i), num, 'done', `${title} row ${i}`)));
}

function plan(epics) {
  return { epics, progress: ['a progress bullet'], path: 'docs/roadmap-execution-plan.md' };
}

// Epics 1-7, 10 and 12 done; 8, 9, 11, 13 carry open rows. The shape of the
// live plan, small enough to read in a failure message.
function livelikePlan() {
  return plan([
    ...[1, 2, 3, 4, 5, 6, 7].map((n) => doneEpic(n, `Done epic ${n}`)),
    epic(8, 'Codebugger explanation trace', [
      task('A', 8, 'planned', 'Runtime-witness rule'),
      task('B', 8, 'planned', 'The codebugger session'),
    ]),
    epic(9, 'Erp portables', [
      task('A', 9, 'done', 'Article II scoping'),
      task('K', 9, 'planned', 'Read-before-write state discipline'),
    ]),
    doneEpic(10, 'Living system model'),
    epic(11, 'Mvp sprint parallel cycles', [
      task('A', 11, 'done', 'Sprint completeness oracle'),
      task('D', 11, 'planned', 'Merge and integrate'),
    ]),
    doneEpic(12, 'System spec delta'),
    epic(13, 'Baseline mcp', [
      task('A', 13, 'planned', 'Rename sprint-channel to baseline'),
    ]),
  ]);
}

async function render(input, opts) {
  const mod = await tryImport(RENDER);
  assert.ok(mod, `${RENDER} must exist — the renderer these ACs pin`);
  return { mod, lines: mod.renderPlan(input, opts) };
}

// The final line names the next pickup and repeats its epic number and title, so
// every helper below reads the body only. Counting the footer as a rendered row
// is what made these filters disagree with what the reader actually sees.
function body(lines) {
  return lines.filter((l) => !l.startsWith('Next planned:'));
}

function rollupLines(lines) {
  return body(lines).filter((l) => /^\s*✅\s*Epics?\b/u.test(l));
}

function epicHeaderLines(lines) {
  return body(lines).filter((l) => /\bEpic \d+\b/u.test(l) && !/^\s*✅\s*Epics?\b/u.test(l));
}

describe('roadmap render — done epics collapse (AC-002)', () => {
  it('test_when_a_run_of_epics_is_all_done_then_one_rollup_line_names_compressed_ranges', async () => {
    const { lines } = await render(livelikePlan(), { all: false });

    const rollups = rollupLines(lines);
    assert.equal(rollups.length, 1, 'every done epic folds into exactly one rollup line');
    assert.match(rollups[0], /1-7/, 'a contiguous run renders as a range');
    assert.match(rollups[0], /\b10\b/, 'a non-contiguous done epic is named on its own');
    assert.match(rollups[0], /\b12\b/);
    assert.match(rollups[0], /\b27\b/, 'the rollup carries the summed row count');

    for (const num of [1, 2, 3, 4, 5, 6, 7, 10, 12]) {
      assert.ok(
        !epicHeaderLines(lines).some((l) => new RegExp(`Epic ${num}\\b`).test(l)),
        `Epic ${num} is done, so it must not get its own header line`,
      );
    }
  });

  it('test_when_a_lone_done_epic_stands_alone_then_it_renders_as_epic_n_not_a_range', async () => {
    const { lines } = await render(plan([
      epic(3, 'Open', [task('A', 3, 'planned', 'open row')]),
      doneEpic(4, 'Alone'),
      epic(5, 'Open too', [task('A', 5, 'planned', 'another open row')]),
    ]), { all: false });

    const rollup = rollupLines(lines)[0];
    assert.match(rollup, /Epic 4\b/, 'a single done epic is named in the singular');
    assert.ok(!/4-4/.test(rollup), 'a one-member run is never rendered as a range');
  });
});

describe('roadmap render — open rows nest and never collapse (AC-003)', () => {
  it('test_when_an_epic_mixes_done_and_open_rows_then_only_the_open_rows_render', async () => {
    const rows = [
      ...Array.from({ length: 9 }, (_, i) => task(`D${i}`, 9, 'done', `finished work ${i}`)),
      task('K', 9, 'planned', 'Read-before-write state discipline'),
      task('L1', 9, 'planned', 'sprint-planner skill'),
      task('L2', 9, 'planned', 'power batch-sprint track'),
    ];
    const { lines } = await render(plan([epic(9, 'Erp portables', rows)]), { all: false });

    const body = lines.join('\n');
    for (const open of ['K', 'L1', 'L2']) {
      assert.match(body, new RegExp(`\\b${open}\\b`), `open row ${open} must render`);
    }
    assert.ok(!/finished work/.test(body), 'no done row title appears without --all');
  });

  it('test_when_the_plan_carries_forty_open_rows_then_none_collapse_to_a_count', async () => {
    const epics = Array.from({ length: 8 }, (_, e) =>
      epic(e + 1, `Epic ${e + 1}`, Array.from({ length: 5 }, (_, r) =>
        task(`R${r}`, e + 1, 'planned', `open row ${e}-${r}`))));

    const { lines } = await render(plan(epics), { all: false });

    const rendered = body(lines).filter((l) => /open row \d+-\d+/.test(l));
    assert.equal(rendered.length, 40, 'every open row renders — this command exists to show them');
  });
});

describe('roadmap render — --all expands everything (AC-004)', () => {
  it('test_when_all_is_set_then_every_epic_renders_its_own_header_and_no_rollup_line', async () => {
    const input = livelikePlan();
    const { lines: collapsed } = await render(input, { all: false });
    const { lines: expanded } = await render(input, { all: true });

    assert.equal(rollupLines(expanded).length, 0, '--all emits no rollup line');
    assert.equal(epicHeaderLines(expanded).length, 13, 'every epic gets its own header under --all');
    assert.ok(
      epicHeaderLines(expanded).length > epicHeaderLines(collapsed).length,
      '--all must show strictly more than the default view',
    );
    assert.match(expanded.join('\n'), /Done epic 1 row 0/, 'done rows render under --all');
  });
});

describe('roadmap render — the next-planned line (AC-005)', () => {
  it('test_when_a_planned_row_exists_then_the_final_line_names_the_first_in_file_order', async () => {
    const { lines } = await render(plan([
      doneEpic(12, 'Later but finished'),
      epic(8, 'First open in file order', [task('A', 8, 'planned', 'the first planned row')]),
      epic(3, 'Lower number, later in the array', [task('Z', 3, 'planned', 'not this one')]),
    ]), { all: false });

    assert.match(
      lines[lines.length - 1],
      /Next planned:\s*Epic 8\s+A\b/,
      'file order decides, not the epic number',
    );
  });

  it('test_when_no_planned_row_exists_then_the_final_line_reads_none', async () => {
    const { lines } = await render(plan([doneEpic(1, 'All done'), doneEpic(2, 'Also done')]), { all: false });

    assert.match(lines[lines.length - 1], /Next planned:\s*\(none\)/);
  });
});

describe('roadmap render — header and contract', () => {
  it('test_when_list_renders_then_the_header_names_the_path_and_the_totals', async () => {
    const { lines } = await render(livelikePlan(), { all: false });

    const head = lines.slice(0, 3).join('\n');
    assert.match(head, /docs\/roadmap-execution-plan\.md/, 'the header names the plan it read');
    assert.match(head, /\b13\b/, 'the totals line carries the epic count');
    assert.match(head, /\b5\b/, 'the totals line carries the planned tally');
  });

  it('test_when_render_plan_receives_a_non_object_then_it_throws_type_error', async () => {
    const mod = await tryImport(RENDER);
    assert.ok(mod, `${RENDER} must exist`);

    for (const bad of [null, undefined, [], 'a plan', 42]) {
      assert.throws(
        () => mod.renderPlan(bad, {}),
        TypeError,
        `renderPlan(${JSON.stringify(bad)}) must throw rather than render a partial view`,
      );
    }
  });

  it('test_when_build_view_runs_then_it_returns_the_projection_the_json_path_emits', async () => {
    const mod = await tryImport(RENDER);
    assert.ok(mod, `${RENDER} must exist`);

    const view = mod.buildView(livelikePlan(), { all: false });

    assert.equal(view.path, 'docs/roadmap-execution-plan.md');
    assert.equal(view.epicCount, 13);
    // 21 rows across epics 1-7, plus the three lone done rows in epics 9, 11 and
    // the three in each of 10 and 12. The rollup's 27 counts only the epics that
    // are wholly done; these totals count every row.
    assert.deepEqual(view.totals, { done: 29, inProgress: 0, planned: 5 });
    assert.ok(Array.isArray(view.groups) && view.groups.length > 0, 'the view carries its groups');
    assert.equal(view.nextPlanned.id, 'A');
    assert.equal(view.nextPlanned.epicNum, 8);
  });
});
