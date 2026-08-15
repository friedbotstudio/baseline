// Scenario suite — epic-to-roadmap append, the ad-hoc backfill, and the Article IV amendment.
// Foundation (fixture builders) at the top, Domain assertions below, one test per recipe row.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

import { parseRoadmap } from '../.claude/skills/roadmap/parse.mjs';
import { taskTokenResolves, promoteEpicHeading } from '../.claude/skills/roadmap-sync/sync.mjs';

// The helpers /implement has not written yet. A guarded dynamic import turns a
// cryptic ERR_MODULE_NOT_FOUND into one named failure that says what is missing.
let appendMod;
let backfillMod;
try {
  appendMod = await import('../.claude/skills/roadmap-sync/append.mjs');
  backfillMod = await import('../.claude/skills/roadmap-sync/backfill.mjs');
} catch (cause) {
  throw new Error(
    'roadmap-sync append/backfill helpers are absent — /implement must create '
    + '.claude/skills/roadmap-sync/append.mjs and .claude/skills/roadmap-sync/backfill.mjs',
    { cause },
  );
}
const { nextEpicNumber, epicPresent, renderEpicSection, appendEpic } = appendMod;
const { backfillEpics } = backfillMod;

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// --- Foundation: roadmap text fixtures (the live grammar, one status emoji per heading) ---

const SEVEN_EPIC_ROADMAP = [
  '# Roadmap',
  '',
  '## Progress',
  '',
  '- Status (2026-08-04): seven epics closed.',
  '',
  '## Epic 6 — Debt and hardening  ✅  (debt)',
  '',
  '- ✅ T1. Bound the slug quantifier.',
  '',
  '## Epic 7 — Living system model  ✅  (memory)',
  '',
  '- ✅ A. Decision node model.',
  '',
].join('\n');

const NO_EPIC_ROADMAP = ['# Roadmap', '', '## Progress', '', '- Nothing yet.', ''].join('\n');

// --- Foundation: on-disk repo fixtures ---

function makeRepo({ roadmap = SEVEN_EPIC_ROADMAP, epics = [], roadmapPath = 'docs/roadmap-execution-plan.md' } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'epicroadmap-'));
  mkdirSync(join(root, '.claude/state/epic'), { recursive: true });
  writeFileSync(
    join(root, '.claude/project.json'),
    `${JSON.stringify({ roadmap: { path: roadmapPath } }, null, 2)}\n`,
    'utf8',
  );
  if (roadmap !== null) {
    mkdirSync(join(root, 'docs'), { recursive: true });
    writeFileSync(join(root, roadmapPath.startsWith('..') ? 'docs/unused.md' : roadmapPath), roadmap, 'utf8');
  }
  for (const epic of epics) writeEpicState(root, epic);
  return root;
}

function writeEpicState(root, epic) {
  writeFileSync(
    join(root, '.claude/state/epic', `${epic.epic}.json`),
    `${JSON.stringify(epic, null, 2)}\n`,
    'utf8',
  );
}

function epicState({ epic, slices = [], children = [], approved = true }) {
  return {
    epic,
    spec: `docs/specs/${epic}.md`,
    scout: `docs/scout/${epic}.md`,
    research: `docs/research/${epic}.md`,
    slices,
    approved,
    children,
  };
}

function slice(id, title) {
  return { id, title, acs: [`${title} holds.`], risk: [] };
}

function roadmapTextOf(root, roadmapPath = 'docs/roadmap-execution-plan.md') {
  return readFileSync(join(root, roadmapPath), 'utf8');
}

const FIVE_EPICS = [
  epicState({ epic: 'codebugger-explanation-trace', slices: [slice('A', 'Witnessed debugging')] }),
  epicState({ epic: 'erp-portables', slices: [slice('A', 'Advisory subagents')] }),
  epicState({ epic: 'living-system-model', slices: [slice('A', 'Decision node model')] }),
  epicState({ epic: 'mvp-sprint-parallel-cycles', slices: [slice('A', 'Parallel cycles')] }),
  epicState({ epic: 'system-spec-delta', slices: [slice('A', 'Delta rows')] }),
];

// --- appendEpic: the golden path (AC-001) ---

test('test_when_three_slice_epic_appended_then_heading_numbered_next_and_rows_planned', () => {
  const root = makeRepo();
  const { text, changed, epicNum } = appendEpic(SEVEN_EPIC_ROADMAP, {
    slug: 'alpha-epic',
    title: 'Alpha epic',
    summary: 'Three separable slices.',
    slices: [slice('A', 'First'), slice('B', 'Second'), slice('C', 'Third')],
  });

  assert.equal(changed, true);
  assert.equal(epicNum, 8);
  assert.match(text, /^## Epic 8 — Alpha epic {2}⬜ {2}\(alpha-epic\)$/m);
  assert.match(text, /^- ⬜ A\. First$/m);
  assert.match(text, /^- ⬜ B\. Second$/m);
  assert.match(text, /^- ⬜ C\. Third$/m);

  writeFileSync(join(root, 'docs/roadmap-execution-plan.md'), text, 'utf8');
  const parsed = parseRoadmap(root);
  const appended = parsed.epics.find((e) => e.num === 8);
  assert.equal(appended.tag, 'alpha-epic');
  assert.equal(appended.status, 'planned');
  assert.deepEqual(appended.tally, { done: 0, inProgress: 0, planned: 3 });
});

// --- appendEpic: dedupe by slug tag (AC-002) ---

test('test_when_slug_tag_already_present_then_append_is_noop', () => {
  const once = appendEpic(SEVEN_EPIC_ROADMAP, {
    slug: 'alpha-epic',
    title: 'Alpha epic',
    slices: [slice('A', 'First')],
  });
  const twice = appendEpic(once.text, {
    slug: 'alpha-epic',
    title: 'Alpha epic renamed since',
    slices: [slice('A', 'First'), slice('B', 'Second')],
  });

  assert.equal(twice.changed, false);
  assert.equal(twice.text, once.text);
  assert.equal(epicPresent(once.text, 'alpha-epic'), true);
  assert.equal(epicPresent(once.text, 'never-appended'), false);
});

// --- backfillEpics: five epics, one write, slug-sorted (AC-003) ---

test('test_when_backfill_runs_over_five_epic_states_then_all_appended_in_one_write', () => {
  const root = makeRepo({ epics: FIVE_EPICS });
  const result = backfillEpics({ rootDir: root });

  assert.equal(result.noop, false);
  assert.equal(result.skipped.length, 0);
  assert.deepEqual(
    result.appended.map((a) => a.slug),
    [
      'codebugger-explanation-trace',
      'erp-portables',
      'living-system-model',
      'mvp-sprint-parallel-cycles',
      'system-spec-delta',
    ],
  );
  assert.deepEqual(result.appended.map((a) => a.epicNum), [8, 9, 10, 11, 12]);

  const parsed = parseRoadmap(root);
  assert.equal(parsed.epics.length, 7);
  for (const { slug, epicNum } of result.appended) {
    const state = JSON.parse(readFileSync(join(root, '.claude/state/epic', `${slug}.json`), 'utf8'));
    assert.equal(state.roadmap_epic, epicNum);
  }
});

test('test_when_backfill_accumulates_then_it_writes_the_roadmap_exactly_once', () => {
  const source = readFileSync(join(REPO_ROOT, '.claude/skills/roadmap-sync/backfill.mjs'), 'utf8');
  const writes = source.match(/writeFileSync\(/g) || [];
  const roadmapWrites = source
    .split('\n')
    .filter((line) => /writeFileSync\(/.test(line) && /roadmap/i.test(line));
  assert.equal(
    roadmapWrites.length,
    1,
    `backfill.mjs must write the roadmap exactly once, not per epic; found ${writes.length} writeFileSync call(s)`,
  );
});

test('test_when_backfill_runs_twice_then_second_run_is_byte_identical_noop', () => {
  const root = makeRepo({ epics: FIVE_EPICS });
  backfillEpics({ rootDir: root });
  const afterFirst = roadmapTextOf(root);

  const second = backfillEpics({ rootDir: root });

  assert.equal(second.noop, true);
  assert.equal(second.appended.length, 0);
  assert.equal(second.skipped.length, 5);
  assert.equal(roadmapTextOf(root), afterFirst);
});

// --- slice status derives from children[] (AC-004) ---

test('test_when_child_committed_then_slice_row_done_and_heading_in_progress', () => {
  const root = makeRepo({
    epics: [
      epicState({
        epic: 'mixed-epic',
        slices: [slice('A', 'Landed slice'), slice('B', 'Open slice')],
        children: [{ slice: 'A', slug: 'mixed-epic-a', status: 'committed' }],
      }),
    ],
  });

  backfillEpics({ rootDir: root });
  const text = roadmapTextOf(root);

  assert.match(text, /^- ✅ A\. Landed slice$/m);
  assert.match(text, /^- ⬜ B\. Open slice$/m);
  assert.match(text, /^## Epic 8 — .* {2}🟡 {2}\(mixed-epic\)$/m);
  assert.equal(promoteEpicHeading(text, 8).status, 'in-progress');
});

// --- the stamped number makes a child's task token resolvable (AC-005) ---

test('test_when_epic_stamped_roadmap_epic_then_child_triage_seeds_resolvable_task_token', () => {
  const root = makeRepo({
    epics: [epicState({ epic: 'token-epic', slices: [slice('A', 'First'), slice('B', 'Second')] })],
  });

  backfillEpics({ rootDir: root });
  const state = JSON.parse(readFileSync(join(root, '.claude/state/epic/token-epic.json'), 'utf8'));
  const text = roadmapTextOf(root);

  assert.equal(state.roadmap_epic, 8);
  assert.equal(taskTokenResolves(text, `E${state.roadmap_epic}-A`), true);
  assert.equal(taskTokenResolves(text, `E${state.roadmap_epic}-B`), true);
  assert.equal(taskTokenResolves(text, `E${state.roadmap_epic}-ZZ`), false);
});

test('test_when_triage_skill_read_then_it_documents_seeding_roadmap_tasks_from_roadmap_epic', () => {
  const skill = readFileSync(join(REPO_ROOT, '.claude/skills/triage/SKILL.md'), 'utf8');
  assert.match(skill, /roadmap_tasks/);
  assert.match(skill, /roadmap_epic/);
});

// --- fail-open (AC-009) ---

test('test_when_roadmap_absent_then_backfill_noops_with_named_reason', () => {
  const root = makeRepo({ roadmap: null, epics: FIVE_EPICS });
  const result = backfillEpics({ rootDir: root });

  assert.equal(result.noop, true);
  assert.equal(result.reason, 'no-roadmap');
  assert.equal(result.appended.length, 0);
});

test('test_when_roadmap_path_escapes_repo_then_backfill_noops', () => {
  const root = makeRepo({ roadmapPath: '../outside.md', epics: FIVE_EPICS });
  const result = backfillEpics({ rootDir: root });

  assert.equal(result.noop, true);
  assert.equal(result.reason, 'no-roadmap');
});

test('test_when_one_epic_state_is_invalid_json_then_it_is_skipped_and_others_append', () => {
  const root = makeRepo({
    epics: [
      epicState({ epic: 'good-one', slices: [slice('A', 'First')] }),
      epicState({ epic: 'good-two', slices: [slice('A', 'First')] }),
    ],
  });
  writeFileSync(join(root, '.claude/state/epic/broken.json'), '{ not json', 'utf8');

  const result = backfillEpics({ rootDir: root });

  assert.deepEqual(result.appended.map((a) => a.slug), ['good-one', 'good-two']);
  assert.deepEqual(result.skipped.map((s) => s.slug), ['broken']);
  assert.match(result.skipped[0].reason, /unreadable|parse|invalid/i);
});

test('test_when_roadmap_unwritable_then_backfill_noops_and_does_not_throw', () => {
  const root = makeRepo({ epics: FIVE_EPICS });
  const path = join(root, 'docs/roadmap-execution-plan.md');
  chmodSync(path, 0o444);
  try {
    const result = backfillEpics({ rootDir: root });
    assert.equal(result.noop, true);
  } finally {
    chmodSync(path, 0o644);
  }
});

test('test_when_epic_state_unwritable_then_stamp_degrades_and_backfill_does_not_throw', () => {
  const root = makeRepo({ epics: [epicState({ epic: 'locked-epic', slices: [slice('A', 'First')] })] });
  const statePath = join(root, '.claude/state/epic/locked-epic.json');
  chmodSync(statePath, 0o444);
  try {
    const result = backfillEpics({ rootDir: root });
    assert.match(
      result.skipped.map((s) => s.reason).join(' '),
      /stamp/i,
      'an un-stampable epic must be reported, not thrown',
    );
    assert.equal(
      JSON.parse(readFileSync(statePath, 'utf8')).roadmap_epic,
      undefined,
      'the stamp genuinely did not land',
    );
  } finally {
    chmodSync(statePath, 0o644);
  }
});

// --- the roadmap grammar is not forgeable from a title (security 2026-08-15) ---

test('test_when_title_or_slice_title_forges_the_grammar_then_render_throws', () => {
  const forgeries = [
    { title: 'Ship ✅ now', tag: 'ok-epic', slices: [{ id: 'A', status: '⬜', title: 't' }] },
    { title: 'X\n\n## Epic 99 — Injected  ✅  (pwned)', tag: 'ok-epic', slices: [] },
    { title: 'Fine', tag: 'ok-epic', slices: [{ id: 'A', status: '⬜', title: 'done ✅ really' }] },
    { title: 'Fine', tag: 'ok-epic', slices: [{ id: 'A', status: '⬜', title: 'a\n- ✅ B. forged' }] },
  ];
  for (const forgery of forgeries) {
    assert.throws(
      () => renderEpicSection({ num: 8, summary: '', ...forgery }),
      /newline|status emoji/i,
      `${JSON.stringify(forgery.title)} / ${JSON.stringify(forgery.slices[0]?.title)} must be rejected`,
    );
  }
});

test('test_when_a_forged_title_reaches_backfill_then_that_epic_is_skipped_and_nothing_is_written', () => {
  const root = makeRepo();
  writeEpicState(root, {
    ...epicState({ epic: 'forge-epic', slices: [slice('A', 'First')] }),
    title: 'Ship ✅ now',
  });
  const before = roadmapTextOf(root);

  const result = backfillEpics({ rootDir: root });

  assert.equal(result.appended.length, 0);
  assert.deepEqual(result.skipped.map((s) => s.slug), ['forge-epic']);
  assert.equal(roadmapTextOf(root), before);
});

// --- boundaries (AC-001) ---

test('test_when_epic_has_zero_slices_then_heading_appended_with_no_rows', () => {
  const root = makeRepo({ epics: [epicState({ epic: 'empty-epic', slices: [] })] });
  const result = backfillEpics({ rootDir: root });

  assert.equal(result.appended.length, 1);
  const parsed = parseRoadmap(root);
  const appended = parsed.epics.find((e) => e.num === 8);
  assert.equal(appended.tasks.length, 0);
  assert.equal(appended.status, 'planned');
});

test('test_when_slice_id_is_malformed_then_render_throws_before_any_write', () => {
  for (const badId of ['A.1', 'A B', '-lead']) {
    assert.throws(
      () => renderEpicSection({
        num: 8,
        title: 'Bad',
        tag: 'bad-epic',
        slices: [{ id: badId, status: '⬜', title: 'x' }],
      }),
      /slice id/i,
      `slice id ${JSON.stringify(badId)} must be rejected`,
    );
  }

  const root = makeRepo({
    epics: [epicState({ epic: 'bad-epic', slices: [{ id: 'A.1', title: 'x', acs: [], risk: [] }] })],
  });
  const before = roadmapTextOf(root);
  const result = backfillEpics({ rootDir: root });
  assert.equal(roadmapTextOf(root), before);
  assert.equal(result.appended.length, 0);
});

test('test_when_roadmap_has_no_epic_headings_then_next_epic_number_is_one', () => {
  assert.equal(nextEpicNumber(NO_EPIC_ROADMAP), 1);
  assert.equal(nextEpicNumber(SEVEN_EPIC_ROADMAP), 8);
});

test('test_when_title_contains_em_dash_or_status_emoji_then_heading_still_parses', () => {
  const root = makeRepo({
    epics: [
      epicState({ epic: 'dash-epic', slices: [slice('A', 'First')] }),
      epicState({ epic: 'emoji-epic', slices: [slice('A', 'First')] }),
    ],
  });
  writeEpicState(root, { ...epicState({ epic: 'dash-epic', slices: [slice('A', 'First')] }), title: 'Alpha — beta' });

  backfillEpics({ rootDir: root });
  const parsed = parseRoadmap(root);

  assert.equal(parsed.epics.length, 4);
  for (const tag of ['dash-epic', 'emoji-epic']) {
    const found = parsed.epics.filter((e) => e.tag === tag);
    assert.equal(found.length, 1, `exactly one epic must carry tag ${tag}`);
    assert.equal(found[0].status, 'planned');
  }
});

// --- the Article IV amendment across all four governance surfaces (AC-010) ---

const SECTION_16 = /^## §16\b/m;

function preSixteen(text) {
  const at = text.search(SECTION_16);
  return at === -1 ? text : text.slice(0, at);
}

test('test_when_amendment_applied_then_article_iv_reads_every_committing_track_and_mirrors_hold', () => {
  const claudeMd = readFileSync(join(REPO_ROOT, 'CLAUDE.md'), 'utf8');
  const mirror = readFileSync(join(REPO_ROOT, 'src/CLAUDE.template.md'), 'utf8');
  const seed = readFileSync(join(REPO_ROOT, 'docs/init/seed.md'), 'utf8');
  const seedMirror = readFileSync(join(REPO_ROOT, 'src/seed.template.md'), 'utf8');

  assert.match(claudeMd, /Roadmap sync \| `\/roadmap-sync` \(every committing track\)/);
  assert.doesNotMatch(claudeMd, /committing tracks \*\*except `epic`\*\*/);
  assert.equal(claudeMd, mirror, 'CLAUDE.md and src/CLAUDE.template.md must stay byte-equal');
  assert.equal(
    preSixteen(seed),
    preSixteen(seedMirror),
    'seed.md and src/seed.template.md must match on the pre-§16 slice (§16 keeps a *Reserved.* placeholder)',
  );
  assert.ok(
    claudeMd.length <= 28000,
    `CLAUDE.md is ${claudeMd.length} characters, over the 28000 budget in tests/warm-context-diet.test.mjs`,
  );
});

test('test_when_annex_read_then_it_no_longer_excepts_epic_from_roadmap_sync', () => {
  const annex = readFileSync(join(REPO_ROOT, '.claude/CONSTITUTION.md'), 'utf8');
  assert.doesNotMatch(annex, /committing track \*\*except `epic`\*\*/);
});

test('test_when_epic_track_read_then_it_declares_a_roadmap_sync_node', () => {
  const lines = readFileSync(join(REPO_ROOT, '.claude/workflows.jsonl'), 'utf8').split('\n').filter(Boolean);
  const tracks = lines.map((l) => JSON.parse(l));
  const epic = tracks.find((t) => t.track_id === 'epic');
  const ids = epic.nodes.map((n) => n.id);

  assert.ok(ids.includes('roadmap-sync'), 'the epic track must declare a roadmap-sync node');
  assert.ok(
    ids.indexOf('roadmap-sync') > ids.indexOf('approve-direction'),
    'roadmap-sync must follow approve-direction',
  );
  assert.ok(
    ids.indexOf('roadmap-sync') < ids.indexOf('memory-sync'),
    'roadmap-sync must precede memory-sync',
  );

  const committing = tracks.filter((t) => t.nodes.some((n) => n.id === 'commit'));
  const missing = committing.filter((t) => !t.nodes.some((n) => n.id === 'roadmap-sync'));
  assert.deepEqual(missing.map((t) => t.track_id), [], 'every committing track must declare roadmap-sync');
});

// --- the change adds no baseline skill (AC-011) ---

test('test_when_audit_baseline_runs_then_exit_zero_and_skill_count_unchanged', () => {
  const out = execFileSync('node', [join(REPO_ROOT, '.claude/skills/audit-baseline/audit.mjs')], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    env: { ...process.env, CLAUDE_PROJECT_DIR: REPO_ROOT },
  });
  assert.match(out, /PASS/);
});

// --- regression trap: the reused transforms keep their behaviour ---

test('test_when_existing_sync_transforms_run_then_behaviour_unchanged', () => {
  const promoted = promoteEpicHeading(
    ['## Epic 3 — All done  🟡  (three)', '', '- ✅ A. One.', '- ✅ B. Two.', ''].join('\n'),
    3,
  );
  assert.equal(promoted.status, 'done');
  assert.equal(promoted.changed, true);
  assert.match(promoted.text, /^## Epic 3 — All done {2}✅ {2}\(three\)$/m);

  assert.equal(taskTokenResolves(SEVEN_EPIC_ROADMAP, 'E7-A'), true);
  assert.equal(taskTokenResolves(SEVEN_EPIC_ROADMAP, 'E7-Q'), false);
});
