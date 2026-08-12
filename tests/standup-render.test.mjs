// T1 — the rendered recap is bounded (AC-002, AC-003).
//
// The behaviour under test is a REDUCTION: 49 commits must not reach the reader
// as 49 lines. A renderer that simply prints everything satisfies "one call"
// while reproducing the cost the ticket exists to remove, so every assertion
// here is about what the output does NOT contain as much as what it does.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { tryImport } from './helpers/memory-fixtures.mjs';

const RENDER = '.claude/skills/standup/render.mjs';

const BUMPS = { feat: 'minor', fix: 'patch', docs: 'none' };

function commit(i) {
  const type = ['feat', 'fix', 'docs'][i % 3];
  return {
    sha: String(i).padStart(40, '0'),
    type,
    scope: 'scope',
    subject: `${type}(scope): subject number ${i}`,
    bump: BUMPS[type],
  };
}

function recapWith(overrides = {}) {
  return {
    release: { lastVersion: '0.21.0', lastTag: 'v0.21.0', commitsSinceTag: [], ...overrides.release },
    releaseModel: null,
    backlog: { open: [], 'picked-up': [], dropped: [] },
    pendingQuestions: [],
    roadmap: null,
    degraded: [],
    ...overrides,
  };
}

async function loadRenderer(assertRef) {
  const mod = await tryImport(RENDER);
  assertRef.ok(mod, `${RENDER} must exist and be importable — it is the bounded-output half of T1`);
  assertRef.equal(typeof mod.renderRecap, 'function', 'expected named export `renderRecap`');
  return mod.renderRecap;
}

describe('standup rendered recap', () => {
  // AC-002
  it('test_when_recap_renders_many_commits_then_output_collapses_to_counts_and_bump', async () => {
    const renderRecap = await loadRenderer(assert);
    const commits = Array.from({ length: 49 }, (_, i) => commit(i));
    const lines = renderRecap(recapWith({ release: { lastVersion: '0.21.0', lastTag: 'v0.21.0', commitsSinceTag: commits } }));
    const text = lines.join('\n');

    const subjectLines = lines.filter((l) => /subject number \d+/.test(l));
    assert.equal(
      subjectLines.length,
      0,
      `rendered mode must emit zero per-commit lines; got ${subjectLines.length}. Dumping every commit is the cost T1 removes`,
    );
    assert.match(text, /\bfeat\b[^\n]*\b17\b|\b17\b[^\n]*\bfeat\b/, 'the 17 feat commits must appear as a count');
    assert.match(text, /\bminor\b/, 'the aggregate bump the 49 commits trigger must be stated');
  });

  // AC-003. Fixtures carry the shape gather.mjs's collectRoadmap actually emits:
  // key `num` (not `number`) and word statuses (not emoji). The previous literals
  // used `number` + emoji, which no producer in this repo ever yields — that is
  // what let the "Epic undefined" seam defect pass a green suite (consumer-
  // install-defects D3). Cross-seam coverage lives in
  // standup-gather-render-contract.test.mjs; this test stays a renderer unit test.
  it('test_when_roadmap_has_three_epics_then_each_appears_with_status_and_tallies', async () => {
    const renderRecap = await loadRenderer(assert);
    const roadmap = {
      epics: [
        { num: 1, title: 'First epic', tag: 'a', status: 'done', tasks: { done: 4, inProgress: 0, planned: 0 } },
        { num: 2, title: 'Second epic', tag: 'b', status: 'in-progress', tasks: { done: 2, inProgress: 1, planned: 3 } },
        { num: 3, title: 'Third epic', tag: 'c', status: 'planned', tasks: { done: 0, inProgress: 0, planned: 5 } },
      ],
      progress: ['3 epics tracked'],
    };
    const text = renderRecap(recapWith({ roadmap })).join('\n');

    for (const epic of roadmap.epics) {
      assert.ok(text.includes(epic.title), `epic "${epic.title}" must be listed — T1 surfaces the roadmap, it does not merely collect it`);
      assert.ok(text.includes(epic.status), `epic "${epic.title}" must carry its status marker`);
      assert.match(text, new RegExp(`Epic ${epic.num}\\b`), `epic "${epic.title}" must carry its number`);
    }
    assert.match(text, /\b5\b/, 'per-task tallies must be rendered, not just epic titles');
  });

  // AC-002 — boundary.
  it('test_when_zero_unreleased_commits_then_render_says_none_and_omits_bump_row', async () => {
    const renderRecap = await loadRenderer(assert);
    const text = renderRecap(recapWith()).join('\n');

    assert.match(text, /no unreleased commits|nothing unreleased|0 unreleased/i, 'an empty commit list must be stated explicitly, not left blank');
    assert.doesNotMatch(text, /next bump: (major|minor|patch)\b/i, 'no bump row when there is nothing to bump');
  });

  // AC-002 — contract violation.
  it('test_when_render_recap_given_null_then_type_error_not_empty_render', async () => {
    const renderRecap = await loadRenderer(assert);
    assert.throws(
      () => renderRecap(null),
      TypeError,
      'renderRecap(null) must throw TypeError; returning an empty list would render "nothing to report" for a caller bug',
    );
  });
});
