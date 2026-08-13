// Workflow standup-recap-single-pass — defects D1..D5.
//
// The failure this defends against: a single `/standup` invocation could not
// answer its own recap. Reading it required five follow-up shell commands —
// `git rev-parse` for the push state, `cat` for a question body, `awk` for the
// planned roadmap row, `node -e` for the release gate, and a second `--json`
// pass for the commit subjects. Every one of those facts was already inside the
// recap or one projection away from it.
//
// D1  release.upstream is gathered and never rendered.
// D2  the pending-question label matcher misses the shipped `- **Question.**`.
// D3  collectRoadmap drops parse.mjs's task rows, keeping only the tally.
// D4  modelLine filters releaseModel and drops completeness_gate.
// D5  commit subjects collapse to counts-by-type at every pile size.
//
// D3 and D5 print detail only below a threshold and degrade to today's counts
// above it, so the reduction principle in render.mjs's header still holds at the
// 70-commit size that motivated it.

import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';

import { tryImport, REPO_ROOT, writeShard } from './helpers/memory-fixtures.mjs';

const GATHER = '.claude/skills/standup/gather.mjs';
const RENDER = '.claude/skills/standup/render.mjs';

const COMMIT_DETAIL_MAX = 20;
const OPEN_TASK_DETAIL_MAX = 20;

const ROADMAP_REL = 'docs/roadmap-execution-plan.md';

const scratch = [];

after(() => {
  for (const dir of scratch) rmSync(dir, { recursive: true, force: true });
});

// ---- Foundation: module loaders + temp trees ---------------------------

async function loadGather(assertRef) {
  const mod = await tryImport(GATHER);
  assertRef.ok(mod, `${GATHER} must be importable`);
  assertRef.equal(typeof mod.gatherSync, 'function', 'expected named export `gatherSync`');
  return mod.gatherSync;
}

async function loadRender(assertRef) {
  const mod = await tryImport(RENDER);
  assertRef.ok(mod, `${RENDER} must be importable`);
  assertRef.equal(typeof mod.renderRecap, 'function', 'expected named export `renderRecap`');
  return mod.renderRecap;
}

function scratchDir(prefix) {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  scratch.push(dir);
  return dir;
}

function writeInto(root, relPath, content) {
  const path = join(root, relPath);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, 'utf8');
  return path;
}

// ---- Domain: corpus builders (the real producer's inputs) --------------

// Questions and the roadmap are read from a real corpus and parsed by the real
// collectors. A hand-written pendingQuestions array would copy the SHAPE of the
// producer's output and drift the same way the renderer's own key mapping did.
function projectWithQuestions(shards) {
  const root = scratchDir('standup-questions-');
  const memDir = join(root, '.claude', 'memory');
  mkdirSync(memDir, { recursive: true });
  for (const { key, bodyLines } of shards) {
    writeShard(memDir, 'pending-questions', key.toLowerCase(), { key, bodyLines });
  }
  return root;
}

function projectWithRoadmap(epicTitle, rows) {
  const root = scratchDir('standup-roadmap-');
  const lines = [`## Epic 1 — ${epicTitle} 🟡 (demo)`, ''];
  for (const { marker, id, title } of rows) lines.push(`- ${marker} ${id}. ${title}`);
  lines.push('');
  writeInto(root, ROADMAP_REL, lines.join('\n'));
  return root;
}

function plannedRows(howMany, prefix = 'P') {
  return Array.from({ length: howMany }, (_, i) => ({
    marker: '⬜',
    id: `${prefix}${i + 1}`,
    title: `Planned row number ${i + 1}.`,
  }));
}

function doneRows(howMany, prefix = 'D') {
  return Array.from({ length: howMany }, (_, i) => ({
    marker: '✅',
    id: `${prefix}${i + 1}`,
    title: `Done row number ${i + 1}.`,
  }));
}

// ---- Domain: recap builders (render is pure, so no repo is needed) -----

function recapWith(overrides = {}) {
  return {
    release: releaseWith(),
    releaseModel: null,
    backlog: { open: [], pickedUp: [], dropped: [] },
    pendingQuestions: [],
    roadmap: null,
    degraded: [],
    ...overrides,
  };
}

function releaseWith(overrides = {}) {
  return {
    lastVersion: '0.22.0',
    lastTag: 'v0.22.0',
    commitsSinceTag: [],
    aggregateBump: 'none',
    upstream: { state: 'up-to-date', ahead: 0, behind: 0 },
    remote: null,
    ...overrides,
  };
}

function commits(howMany, type = 'feat') {
  return Array.from({ length: howMany }, (_, i) => ({
    sha: `sha${i + 1}`,
    type,
    scope: null,
    subject: `${type}: subject number ${i + 1}`,
    bump: type === 'feat' ? 'minor' : 'patch',
  }));
}

function subjectLinesIn(lines, howMany) {
  return lines.filter((line) => /subject number \d+/.test(line)).length === howMany;
}

// ---- D1 — the push state is in the recap and must reach the reader -----

describe('D1 — release.upstream renders', () => {
  it('test_when_upstream_is_ahead_then_recap_names_the_unpushed_count', async () => {
    const renderRecap = await loadRender(assert);
    // commitsSinceTag is left empty on purpose: with zero commits the only `4`
    // the renderer can possibly emit is the unpushed count, so this cannot pass
    // by matching an unrelated commit tally.
    const text = renderRecap(
      recapWith({ release: releaseWith({ upstream: { state: 'ahead', ahead: 4, behind: 0 } }) }),
    ).join('\n');

    assert.match(
      text,
      /(unpushed|ahead|not pushed)[^\n]*\b4\b|\b4\b[^\n]*(unpushed|ahead|not pushed)/i,
      'D1: gather.mjs:90 collects release.upstream and render.mjs never prints it, so answering "is this pushed?" cost a `git rev-parse` on a recap that already held the answer',
    );
  });

  it('test_when_branch_tracks_no_remote_then_recap_says_so_without_claiming_sync', async () => {
    const renderRecap = await loadRender(assert);
    const text = renderRecap(
      recapWith({ release: releaseWith({ upstream: { state: 'no-upstream', ahead: 0, behind: 0 } }) }),
    ).join('\n');

    assert.match(
      text,
      /no upstream|no tracking|not tracked|nothing to compare/i,
      'D1: a branch with no upstream must be reported as having nothing to compare',
    );
    assert.doesNotMatch(
      text,
      /in sync|up to date|level with|\bpushed\b/i,
      'D1: "nothing to compare" must never render as "in sync" — the same distinction collectRemoteFreshness draws between not-comparable and matched, and collapsing it is what made an unpushed branch read as current',
    );
  });

  it('test_when_upstream_is_level_then_recap_states_pushed', async () => {
    const renderRecap = await loadRender(assert);
    const text = renderRecap(
      recapWith({ release: releaseWith({ upstream: { state: 'up-to-date', ahead: 0, behind: 0 } }) }),
    ).join('\n');

    assert.match(
      text,
      /in sync|up to date|level with|\bpushed\b/i,
      'D1: a level branch must say so positively, or a reader cannot tell it from an unrendered field',
    );
    assert.doesNotMatch(
      text,
      /\b[1-9]\d* commits? (ahead|unpushed)/i,
      'D1: a level branch must not report an unpushed count',
    );
  });
});

// ---- D2 — the shipped question label is the one the matcher misses -----

describe('D2 — collectPendingQuestions reads the shipped label spelling', () => {
  const BOLD_QUESTION = 'Should a roadmap task need evidence its mechanism fired?';

  it('test_when_question_shard_uses_a_bold_label_then_the_question_text_is_captured', async () => {
    const gatherSync = await loadGather(assert);
    const root = projectWithQuestions([
      { key: 'Q-001', bodyLines: ['> a verbatim cue', '', `- **Question.** ${BOLD_QUESTION}`] },
    ]);

    const { pendingQuestions } = gatherSync({ rootDir: root });

    assert.equal(
      pendingQuestions.length,
      1,
      'D2: the shard must be collected at all — an empty list would make the question assertion below vacuous',
    );
    assert.equal(
      pendingQuestions[0].question,
      BOLD_QUESTION,
      'D2: gather.mjs:252 matches /^-?\\s*Question:\\s*(.+)$/m, but every shipped shard writes `- **Question.**` with the period inside the bold, so every question rendered empty',
    );
  });

  it('test_when_question_shard_uses_the_legacy_colon_label_then_the_question_text_is_still_captured', async () => {
    const gatherSync = await loadGather(assert);
    const root = projectWithQuestions([
      { key: 'Q-002', bodyLines: [`- Question: ${BOLD_QUESTION}`] },
    ]);

    const { pendingQuestions } = gatherSync({ rootDir: root });

    assert.equal(pendingQuestions.length, 1, 'D2: the legacy-spelling shard must still be collected');
    assert.equal(
      pendingQuestions[0].question,
      BOLD_QUESTION,
      'D2: widening the matcher must not drop the plain `Question:` spelling it already handled',
    );
  });

  it('test_when_question_shard_uses_a_bold_blocker_label_then_the_blocker_is_captured', async () => {
    const gatherSync = await loadGather(assert);
    const root = projectWithQuestions([
      {
        key: 'Q-004',
        bodyLines: [`- **Question.** ${BOLD_QUESTION}`, '- **Blocker.** the roadmap sync rule'],
      },
    ]);

    const { pendingQuestions } = gatherSync({ rootDir: root });

    assert.equal(pendingQuestions.length, 1, 'D2: the shard must be collected');
    assert.equal(
      pendingQuestions[0].blocker,
      'the roadmap sync rule',
      'D2: the blocker field carries the identical label bug as the question field, and one matcher must serve both so the two spellings can never drift apart',
    );
  });

  it('test_when_a_question_shard_declares_no_blocker_then_blocker_is_empty_and_no_stray_marker_renders', async () => {
    const gatherSync = await loadGather(assert);
    const renderRecap = await loadRender(assert);
    const root = projectWithQuestions([
      { key: 'Q-003', bodyLines: [`- **Question.** ${BOLD_QUESTION}`] },
    ]);

    const recap = gatherSync({ rootDir: root });
    const text = renderRecap(recap).join('\n');

    assert.equal(
      recap.pendingQuestions[0].blocker,
      '',
      'D2: a shard that declares no blocker has an absent field, not a failed parse',
    );
    assert.ok(
      text.includes(BOLD_QUESTION),
      'D2: the question text must reach the rendered recap — reading it cost a `cat` of the shard when the recap already held it',
    );
    assert.doesNotMatch(
      text,
      /blocks:\s*(\n|$)/i,
      'D2: an absent blocker must render nothing, not a dangling `blocks:` fragment',
    );
  });
});

// ---- D3 — the roadmap rows exist in parse.mjs and stop at the tally ----

describe('D3 — open roadmap rows reach the recap', () => {
  it('test_when_an_epic_has_open_rows_then_the_recap_names_their_titles', async () => {
    const gatherSync = await loadGather(assert);
    const renderRecap = await loadRender(assert);
    const root = projectWithRoadmap('Debt and hardening', [
      { marker: '✅', id: 'T1', title: 'Already landed.' },
      { marker: '⬜', id: 'T2', title: 'Re-home the scoped landmarks.' },
      { marker: '🟡', id: 'T3', title: 'Half-finished sweep.' },
    ]);

    const recap = gatherSync({ rootDir: root });
    const epic = recap.roadmap.epics[0];

    assert.deepEqual(
      epic.tasks,
      { done: 1, inProgress: 1, planned: 1 },
      'D3: epic.tasks must stay the tally OBJECT — tests/standup-roadmap-parity.test.mjs:57 forbids the row array landing here, so the rows need their own key',
    );
    assert.ok(Array.isArray(epic.openTasks), 'D3: open rows must be projected onto a new `openTasks` sibling key');
    assert.deepEqual(
      epic.openTasks.map((row) => row.id).sort(),
      ['T2', 'T3'],
      'D3: parse.mjs parses every row with its id, status and title, and collectRoadmap keeps only the tally — so "planned 1" never said WHICH task was planned',
    );

    const text = renderRecap(recap).join('\n');
    assert.ok(
      text.includes('Re-home the scoped landmarks.'),
      'D3: the planned row title must render — learning it cost an `awk` over the roadmap file',
    );
    assert.ok(text.includes('T2'), 'D3: the row id must render so the reader can address the task');
    assert.ok(text.includes('Half-finished sweep.'), 'D3: an in-progress row is open work and must render too');
  });

  it('test_when_done_rows_dominate_an_epic_then_only_open_rows_render', async () => {
    const gatherSync = await loadGather(assert);
    const renderRecap = await loadRender(assert);
    const root = projectWithRoadmap('Mostly landed', [...doneRows(10), ...plannedRows(1)]);

    const recap = gatherSync({ rootDir: root });
    const text = renderRecap(recap).join('\n');

    assert.equal(
      recap.roadmap.epics[0].openTasks.length,
      1,
      'D3: only planned and in-progress rows are open work',
    );
    assert.ok(text.includes('Planned row number 1.'), 'D3: the one open row must render');
    assert.doesNotMatch(
      text,
      /Done row number \d+/,
      'D3: done rows are where the volume is and carry no pickup signal, so they must never render as titles',
    );
  });

  it('test_when_open_rows_exceed_the_threshold_then_the_roadmap_degrades_to_tallies', async () => {
    const gatherSync = await loadGather(assert);
    const renderRecap = await loadRender(assert);
    const tooMany = OPEN_TASK_DETAIL_MAX + 1;
    const root = projectWithRoadmap('Wide open', plannedRows(tooMany));

    const recap = gatherSync({ rootDir: root });
    const lines = renderRecap(recap);
    const text = lines.join('\n');

    assert.equal(
      recap.roadmap.epics[0].openTasks.length,
      tooMany,
      'D3: the gatherer projects every open row; the THRESHOLD is a rendering decision, not a collection one',
    );
    assert.equal(
      lines.filter((line) => /Planned row number \d+/.test(line)).length,
      0,
      `D3: above ${OPEN_TASK_DETAIL_MAX} open rows the roadmap must fall back to tallies — printing them all reproduces the cost render.mjs's header says the CLI exists to remove`,
    );
    assert.match(text, /planned[^\n]*\b21\b|\b21\b[^\n]*planned/i, 'D3: the tally must still be reported above the threshold');
  });
});

// ---- D4 — the gate that decides whether the pile may ship --------------

describe('D4 — releaseModel.completeness_gate renders', () => {
  const POLICY = {
    release_trigger: 'on-push',
    release_cycle: 'continuous',
    consumer_upgrade_cadence: 'rare',
  };

  it('test_when_the_release_model_declares_a_completeness_gate_then_the_recap_states_it', async () => {
    const renderRecap = await loadRender(assert);
    const releaseModel = { ...POLICY, completeness_gate: { enabled: true, half_wired_blocks_release: true } };
    const text = renderRecap(recapWith({ releaseModel })).join('\n');

    assert.match(
      text,
      /completeness|half.?wired/i,
      'D4: modelLine filters releaseModel to three keys, so the flag deciding whether the unreleased pile may be cut was dropped — a recap that omits it cannot answer its own release question',
    );
  });

  it('test_when_no_completeness_gate_is_declared_then_no_gate_line_renders', async () => {
    const renderRecap = await loadRender(assert);
    const text = renderRecap(recapWith({ releaseModel: { ...POLICY } })).join('\n');

    assert.match(
      text,
      /release_trigger=on-push/,
      'D4: the three policy fields must still render — without this the absence assertion below would pass on an empty block',
    );
    assert.doesNotMatch(
      text,
      /completeness|half.?wired/i,
      'D4: an undeclared gate is absent policy, not a disabled gate, and must render nothing',
    );
  });
});

// ---- D5 — commit subjects below the threshold --------------------------

describe('D5 — unreleased commit subjects render below the threshold', () => {
  it('test_when_unreleased_commits_are_few_then_the_recap_lists_their_subjects', async () => {
    const renderRecap = await loadRender(assert);
    const lines = renderRecap(recapWith({ release: releaseWith({ commitsSinceTag: commits(4) }) }));
    const text = lines.join('\n');

    assert.ok(
      subjectLinesIn(lines, 4),
      'D5: four commits must each render a subject line — judging whether the pile is safe to ship cost a second `--json` pass because counts-by-type says nothing about content',
    );
    assert.match(text, /minor/, 'D5: the aggregate bump must still be stated alongside the subjects');
  });

  it('test_when_unreleased_commits_exceed_the_threshold_then_the_recap_collapses_to_counts', async () => {
    const renderRecap = await loadRender(assert);
    const tooMany = COMMIT_DETAIL_MAX + 1;
    const lines = renderRecap(recapWith({ release: releaseWith({ commitsSinceTag: commits(tooMany) }) }));
    const text = lines.join('\n');

    assert.ok(
      subjectLinesIn(lines, 0),
      `D5: above ${COMMIT_DETAIL_MAX} commits the recap must emit zero subject lines — this is the 70-commit pile that motivated the reduction principle`,
    );
    assert.match(text, /feat[^\n]*\b21\b|\b21\b[^\n]*feat/i, 'D5: the collapsed path must still report counts-by-type');
    assert.match(text, /minor/, 'D5: the collapsed path must still report the aggregate bump');
  });
});

// ---- boundary — one row must not become a screen of text ---------------

describe('boundary — every detail line stays one line', () => {
  it('test_when_a_row_title_is_long_then_each_rendered_detail_line_stays_one_line', async () => {
    const gatherSync = await loadGather(assert);
    const renderRecap = await loadRender(assert);
    // parse.mjs sets a row's title to the FULL row text, and the live roadmap's
    // T11 row runs past 1000 characters. Clipping is a correctness requirement
    // here, not polish.
    const longTitle = `Re-home the landmarks. ${'and then some more prose '.repeat(50)}`;
    const root = projectWithRoadmap('Long titles', [{ marker: '⬜', id: 'TLONG', title: longTitle }]);

    const lines = renderRecap(gatherSync({ rootDir: root }));
    const rowLines = lines.filter((line) => line.includes('TLONG'));

    assert.equal(rowLines.length, 1, 'boundary: the long row must render on exactly one line');
    assert.ok(
      rowLines[0].length <= 200,
      `boundary: a 1200-character title must be clipped; got a ${rowLines[0].length}-character line, which turns one roadmap row into a screen of text`,
    );
  });
});

// ---- regression — the six-key contract ---------------------------------

describe('regression — the recap shape is unchanged', () => {
  it('test_when_gathersync_runs_then_it_still_returns_exactly_six_top_level_keys', async () => {
    const gatherSync = await loadGather(assert);

    assert.deepEqual(
      Object.keys(gatherSync({ rootDir: REPO_ROOT })).sort(),
      ['backlog', 'degraded', 'pendingQuestions', 'release', 'releaseModel', 'roadmap'],
      'D3 nests openTasks inside the existing roadmap key rather than adding a seventh top-level key, per .claude/memory/landmarks/standup-gather.md — tests/standup-cli-recap.test.mjs:71 asserts the same contract',
    );
  });
});

// ---- hardening — findings from the security review ---------------------

// Both guard code this workflow introduced, so they are regressions rather than
// inherited weaknesses. Report: docs/security/standup-recap-single-pass-2026-08-13.md
describe('hardening — the label matcher stays linear', () => {
  const WHITESPACE_RUN = 40_000;
  const CEILING_MS = 2_000;

  it('test_when_a_shard_line_is_mostly_whitespace_then_parsing_stays_linear', async () => {
    const gatherSync = await loadGather(assert);
    // A line of leading whitespace that never reaches the label is the input the
    // two adjacent `\s*` runs disagreed over. Measured: 0.3ms linear vs 2563ms
    // quadratic at 32k, and gatherSync pays it once per label, so a ceiling three
    // orders of magnitude above the linear cost cannot flake into a false pass.
    const root = projectWithQuestions([
      { key: 'Q-005', bodyLines: [`${' '.repeat(WHITESPACE_RUN)}X`, '- **Question.** a real question'] },
    ]);

    const started = process.hrtime.bigint();
    const { pendingQuestions } = gatherSync({ rootDir: root });
    const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6;

    assert.equal(
      pendingQuestions[0].question,
      'a real question',
      'hardening: the shard must still parse — a timing assertion over a corpus that returns nothing measures nothing',
    );
    assert.ok(
      elapsedMs < CEILING_MS,
      `hardening: \`\\s*[-*]?\\s*\` backtracks quadratically on leading whitespace, and gatherSync runs on every session start via memory_session_start.mjs:249 — took ${elapsedMs.toFixed(0)}ms for ${WHITESPACE_RUN} spaces`,
    );
  });
});

describe('hardening — control sequences never reach the terminal', () => {
  const ESC = '\u001b';
  const PAYLOAD = `${ESC}[31mred${ESC}]0;title\u0007 tail`;
  const CONTROL_CHARS = /[\u0000-\u001f\u007f-\u009f]/u;

  it('test_when_a_roadmap_title_carries_escape_sequences_then_the_rendered_line_is_inert', async () => {
    const gatherSync = await loadGather(assert);
    const renderRecap = await loadRender(assert);
    const root = projectWithRoadmap('Hostile', [{ marker: '⬜', id: 'TESC', title: PAYLOAD }]);

    const line = renderRecap(gatherSync({ rootDir: root })).find((l) => l.includes('TESC'));

    assert.ok(line, 'hardening: the row must render — an absent line would pass the assertion below vacuously');
    assert.doesNotMatch(
      line,
      CONTROL_CHARS,
      'hardening: clip collapses \\s+ but ESC and BEL are not whitespace, so repository-controlled bytes reached the terminal verbatim',
    );
    assert.ok(line.includes('red'), 'hardening: stripping controls must keep the readable text');
  });

  it('test_when_a_question_body_carries_escape_sequences_then_the_rendered_line_is_inert', async () => {
    const gatherSync = await loadGather(assert);
    const renderRecap = await loadRender(assert);
    const root = projectWithQuestions([
      { key: 'Q-006', bodyLines: [`- **Question.** ${PAYLOAD}`] },
    ]);

    const line = renderRecap(gatherSync({ rootDir: root })).find((l) => l.includes('Q-006'));

    assert.ok(line, 'hardening: the question must render');
    assert.doesNotMatch(
      line,
      CONTROL_CHARS,
      'hardening: a memory shard is repository-controlled content and must not be able to drive the operator terminal',
    );
  });
});

// ---- acceptance — the originating complaint ----------------------------

describe('acceptance — one pass answers the recap', () => {
  it('test_when_the_recap_renders_this_repo_then_one_pass_answers_every_standup_question', async () => {
    const gatherSync = await loadGather(assert);
    const renderRecap = await loadRender(assert);

    const recap = gatherSync({ rootDir: REPO_ROOT });
    const text = renderRecap(recap).join('\n');

    // Each clause is guarded on the field being present, because this asserts
    // against the LIVE repository: a released pile, an answered question or a
    // finished epic legitimately removes one. The tripwire below is what stops
    // every clause going absent from reading as a pass.
    let exercised = 0;

    if (recap.release?.upstream && recap.release.upstream.state !== 'no-upstream') {
      exercised += 1;
      assert.match(
        text,
        /in sync|up to date|level with|unpushed|ahead|not pushed|behind/i,
        'acceptance: the rendered recap must state the push state, which cost a `git rev-parse`',
      );
    }

    const openRow = recap.roadmap?.epics?.flatMap((epic) => epic.openTasks ?? [])[0];
    if (openRow) {
      exercised += 1;
      assert.ok(
        text.includes(openRow.id),
        `acceptance: open roadmap row ${openRow.id} must be named, which cost an \`awk\` over the plan`,
      );
    }

    if (recap.releaseModel?.completeness_gate) {
      exercised += 1;
      assert.match(
        text,
        /completeness|half.?wired/i,
        'acceptance: the completeness gate must render, which cost a `node -e` over project.json',
      );
    }

    for (const question of recap.pendingQuestions ?? []) {
      if (!question.question) continue;
      exercised += 1;
      assert.ok(
        text.includes(question.question.slice(0, 40)),
        `acceptance: ${question.id}'s text must render, which cost a \`cat\` of the shard`,
      );
    }

    assert.ok(
      exercised >= 2,
      `acceptance: at least two clauses must actually run or this test is vacuous; only ${exercised} were exercised against the live repo`,
    );
  });
});
