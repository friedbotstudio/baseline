// Epic 13 follow-up — a power batch closes its epic the way a child does.
//
// A power batch lands every slice of an epic in one cycle. The step that records
// a slice as done and closes the epic when the last one lands is gated on the
// epic-child track, so on a power batch it never runs. The visible symptom is a
// roadmap that reads finished beside an epic record that reads never started:
// roadmap-sync flips the rows from the workflow's own token list, while the epic
// state file keeps zero registered children and no closed flag. Nothing then
// archives the discovery bundle either.
//
// The fix is one exported function the commit skill can call on either track,
// rather than a second copy of the flip written into the power path. Two copies
// of a rule that decides when an epic is finished is how they come to disagree.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, rmSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const { registerClosedChildren, CLOSED_STATUSES } =
  await import('../.claude/skills/commit/epic_close.mjs');

function makeEpic({ slices = ['A', 'B'], children = [] } = {}) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'power-epic-')));
  mkdirSync(join(root, '.claude/state/epic'), { recursive: true });
  const state = { epic: 'demo', slices: slices.map((id) => ({ id, title: `slice ${id}` })), children };
  const path = join(root, '.claude/state/epic/demo.json');
  writeFileSync(path, JSON.stringify(state, null, 2));
  return { root, path, read: () => JSON.parse(readFileSync(path, 'utf8')), cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

describe('a power batch registers its slices as closed children', () => {
  it('test_when_a_batch_lands_then_every_slice_is_registered_committed', () => {
    const e = makeEpic({ slices: ['A', 'B', 'C'] });
    try {
      const r = registerClosedChildren({ rootDir: e.root, epic: 'demo', slices: ['A', 'B', 'C'] });
      assert.equal(r.ok, true, r.reason);
      assert.deepEqual(r.registered.sort(), ['A', 'B', 'C']);

      const children = e.read().children;
      assert.deepEqual(children.map((c) => c.slice).sort(), ['A', 'B', 'C']);
      for (const c of children) assert.equal(c.status, 'committed');
    } finally { e.cleanup(); }
  });

  it('test_when_a_slice_is_already_closed_then_its_record_is_left_alone', () => {
    // A slice superseded by other work is finished; overwriting it with
    // "committed" would erase why it closed and claim a commit that never was.
    const e = makeEpic({
      slices: ['A', 'B'],
      children: [{ slice: 'A', status: 'superseded', superseded_by: 'other-epic' }],
    });
    try {
      const r = registerClosedChildren({ rootDir: e.root, epic: 'demo', slices: ['A', 'B'] });
      assert.equal(r.ok, true);
      assert.deepEqual(r.registered, ['B'], 'only the open slice is newly registered');

      const a = e.read().children.find((c) => c.slice === 'A');
      assert.equal(a.status, 'superseded', 'the existing verdict survives');
      assert.equal(a.superseded_by, 'other-epic', 'and so does its reason');
    } finally { e.cleanup(); }
  });

  it('test_when_an_open_child_exists_then_it_is_flipped_rather_than_duplicated', () => {
    const e = makeEpic({ slices: ['A'], children: [{ slice: 'A', status: 'open', note: 'in flight' }] });
    try {
      registerClosedChildren({ rootDir: e.root, epic: 'demo', slices: ['A'] });
      const children = e.read().children;
      assert.equal(children.length, 1, 'no second row for the same slice');
      assert.equal(children[0].status, 'committed');
      assert.equal(children[0].note, 'in flight', 'the rest of the record is preserved');
    } finally { e.cleanup(); }
  });

  it('test_when_run_twice_then_the_second_run_changes_nothing', () => {
    const e = makeEpic({ slices: ['A', 'B'] });
    try {
      registerClosedChildren({ rootDir: e.root, epic: 'demo', slices: ['A', 'B'] });
      const first = readFileSync(e.path, 'utf8');
      const second = registerClosedChildren({ rootDir: e.root, epic: 'demo', slices: ['A', 'B'] });
      assert.deepEqual(second.registered, [], 'nothing left to register');
      assert.equal(readFileSync(e.path, 'utf8'), first, 'and the file is untouched');
    } finally { e.cleanup(); }
  });

  it('test_when_a_slice_is_not_declared_by_the_epic_then_it_is_refused', () => {
    // Registering an undeclared slice would close an epic against work it never
    // planned, which is the mis-close this epic's own record already suffered.
    const e = makeEpic({ slices: ['A'] });
    try {
      const r = registerClosedChildren({ rootDir: e.root, epic: 'demo', slices: ['A', 'Z'] });
      assert.equal(r.ok, false);
      assert.match(r.reason, /Z/, 'the refusal names the undeclared slice');
      assert.deepEqual(e.read().children, [], 'and nothing is written');
    } finally { e.cleanup(); }
  });

  it('test_when_the_epic_has_no_state_file_then_it_reports_rather_than_throws', () => {
    const e = makeEpic();
    try {
      const r = registerClosedChildren({ rootDir: e.root, epic: 'no-such-epic', slices: ['A'] });
      assert.equal(r.ok, false);
      assert.match(r.reason, /no-such-epic/);
    } finally { e.cleanup(); }
  });

  it('test_when_an_epic_slug_is_unsafe_then_no_path_is_built_from_it', () => {
    const e = makeEpic();
    try {
      for (const bad of ['../escape', 'a/b', '']) {
        const r = registerClosedChildren({ rootDir: e.root, epic: bad, slices: ['A'] });
        assert.equal(r.ok, false, `${JSON.stringify(bad)} must be refused`);
        assert.match(r.reason, /epic/i);
      }
    } finally { e.cleanup(); }
  });

  it('test_when_registration_completes_then_the_epic_has_no_open_slices_left', () => {
    // The point of the whole exercise: after this runs, the close check passes.
    const e = makeEpic({ slices: ['A', 'B', 'C'] });
    try {
      registerClosedChildren({ rootDir: e.root, epic: 'demo', slices: ['A', 'B', 'C'] });
      const state = e.read();
      const closedSlices = new Set(state.children.filter((c) => CLOSED_STATUSES.includes(c.status)).map((c) => c.slice));
      const uncovered = state.slices.filter((s) => !closedSlices.has(s.id));
      assert.deepEqual(uncovered, [], 'every declared slice is covered by a closed child');
    } finally { e.cleanup(); }
  });
});

describe('the commit skill runs the fold on a power batch too', () => {
  it('test_when_the_commit_sop_is_read_then_the_fold_is_not_gated_on_epic_child_alone', () => {
    // The defect was procedural, not mechanical: the helper worked, the SOP just
    // told the model to skip it on every track but one.
    const sop = readFileSync(join(ROOT, '.claude/skills/commit/SKILL.md'), 'utf8');
    const step = sop.split('\n').find((l) => l.trim().startsWith('2.8.'));
    assert.ok(step, 'the commit SOP must still carry step 2.8');
    assert.match(step, /power/i, 'the fold must name the power track');
    assert.match(step, /registerClosedChildren/, 'and the helper it calls to register a batch');
    assert.ok(
      !/if it is not an? `epic-child` track, skip this step/i.test(step),
      'the unconditional epic-child-only skip must be gone',
    );
  });
});
