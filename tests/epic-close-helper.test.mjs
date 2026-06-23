// epic-close-bundle-archival — AC-001..AC-006
//
// SUT: .claude/skills/commit/epic_close.mjs  (does not exist yet -> RED)
//
// The helper, given an epic slug, archives the live discovery bundle to
// docs/archive/<UTC-date>/<epic>/ and writes closed:true + closed_at into the
// epic state file ONLY when every child is committed and the epic is not
// already closed. It never creates a commit; the caller (commit skill fold, or
// the maintainer in recovery) lands the staged move.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  makeEpicRepo,
  runEpicClose,
  readState,
  pathExists,
  archivedBundleDir,
  headCommitCount,
  porcelain,
  cleanup,
} from './helpers/epic-close-fixture.mjs';
import path from 'node:path';

const sliceSet = (...ids) => ids.map((id) => ({ id, title: `slice ${id}`, acs: [], risk: [] }));

describe('epic_close.mjs — archive + close (AC-001)', () => {
  it('test_when_all_children_committed_then_bundle_archived_and_epic_closed', async () => {
    const { tmp, epic, statePath } = await makeEpicRepo({
      epic: 'feat-x',
      children: [
        { slice: 'A', slug: 'child-a', status: 'committed' },
        { slice: 'B', slug: 'child-b', status: 'committed' },
        { slice: 'C', slug: 'child-c', status: 'committed' },
      ],
    });
    try {
      const { status } = runEpicClose(tmp, epic);
      assert.equal(status, 0, 'helper exits 0 on a fully-committed epic');

      const bundle = await archivedBundleDir(tmp, epic);
      assert.equal(await pathExists(path.join(bundle, 'spec.md')), true, 'spec moved into archive bundle');
      assert.equal(await pathExists(path.join(bundle, 'scout.md')), true, 'scout moved into archive bundle');
      assert.equal(await pathExists(path.join(bundle, 'research.md')), true, 'research moved into archive bundle');

      const state = await readState(statePath);
      assert.equal(state.closed, true, 'epic state marked closed');
      assert.equal(typeof state.closed_at, 'number', 'closed_at is a numeric epoch');
    } finally {
      await cleanup(tmp);
    }
  });
});

describe('epic_close.mjs — in-flight no-op (AC-002)', () => {
  it('test_when_child_still_open_then_helper_noops', async () => {
    const { tmp, epic, statePath } = await makeEpicRepo({
      epic: 'feat-y',
      children: [
        { slice: 'A', slug: 'child-a', status: 'committed' },
        { slice: 'B', slug: 'child-b', status: 'open' },
        { slice: 'C', slug: 'child-c', status: 'committed' },
      ],
    });
    try {
      const { status, stdout } = runEpicClose(tmp, epic);
      assert.equal(status, 0, 'in-flight epic is a clean no-op (exit 0)');
      assert.match(stdout, /still in flight/i, 'reports still-in-flight');
      assert.match(stdout, /1 of 3/, 'names the open count');
      assert.equal(await pathExists(path.join(tmp, 'docs/archive')), false, 'nothing archived');
      const state = await readState(statePath);
      assert.notEqual(state.closed, true, 'no closed flag written while in flight');
    } finally {
      await cleanup(tmp);
    }
  });
});

describe('epic_close.mjs — idempotent (AC-003)', () => {
  it('test_when_already_closed_then_helper_noops', async () => {
    const { tmp, epic } = await makeEpicRepo({
      epic: 'feat-z',
      children: [{ slice: 'A', slug: 'child-a', status: 'committed' }],
    });
    try {
      const first = runEpicClose(tmp, epic);
      assert.equal(first.status, 0, 'first close succeeds');
      const bundle = await archivedBundleDir(tmp, epic);
      const fs = await import('node:fs/promises');
      const countBefore = (await fs.readdir(bundle)).length;

      const second = runEpicClose(tmp, epic);
      assert.equal(second.status, 0, 're-run exits 0');
      assert.match(second.stdout, /already closed/i, 'reports already-closed');
      const countAfter = (await fs.readdir(bundle)).length;
      assert.equal(countAfter, countBefore, 'no second move; bundle file count unchanged');
    } finally {
      await cleanup(tmp);
    }
  });
});

describe('epic_close.mjs — approved untouched + file retained (AC-004)', () => {
  it('test_when_close_runs_then_approved_untouched_and_file_retained', async () => {
    const { tmp, epic, statePath } = await makeEpicRepo({
      epic: 'feat-keep',
      approved: true,
      children: [{ slice: 'A', slug: 'child-a', status: 'committed' }],
    });
    try {
      const before = await readState(statePath);
      const { status } = runEpicClose(tmp, epic);
      assert.equal(status, 0, 'close succeeds (exercises the real path, not a vacuous no-op)');
      assert.equal(await pathExists(statePath), true, 'epic state file retained (not deleted)');
      const after = await readState(statePath);
      assert.equal(after.closed, true, 'close actually ran (so the approved check is meaningful)');
      assert.equal(after.approved, before.approved, 'approved field never modified by the close path');
    } finally {
      await cleanup(tmp);
    }
  });
});

describe('epic_close.mjs — robustness (AC-005)', () => {
  it('test_when_epic_state_absent_then_exit0_noop', async () => {
    const { tmp } = await makeEpicRepo({ epic: 'present', children: [{ slice: 'A', slug: 'a', status: 'committed' }] });
    try {
      const { status, stdout } = runEpicClose(tmp, 'does-not-exist');
      assert.equal(status, 0, 'absent epic is a clean no-op');
      assert.match(stdout, /no such epic/i, 'names the missing epic');
      assert.equal(await pathExists(path.join(tmp, 'docs/archive')), false, 'nothing archived');
    } finally {
      await cleanup(tmp);
    }
  });

  it('test_when_missing_arg_then_exit2', async () => {
    const { tmp } = await makeEpicRepo({ epic: 'whatever', children: [{ slice: 'A', slug: 'a', status: 'committed' }] });
    try {
      const { status } = runEpicClose(tmp); // no slug
      assert.equal(status, 2, 'missing slug arg exits 2');
    } finally {
      await cleanup(tmp);
    }
  });

  it('test_when_malformed_json_then_exit2', async () => {
    const { tmp, epic, statePath } = await makeEpicRepo({
      epic: 'broken',
      children: [{ slice: 'A', slug: 'a', status: 'committed' }],
    });
    const fs = await import('node:fs/promises');
    await fs.writeFile(statePath, '{ this is not json');
    try {
      const { status } = runEpicClose(tmp, epic);
      assert.equal(status, 2, 'malformed epic state JSON exits 2');
    } finally {
      await cleanup(tmp);
    }
  });
});

describe('epic_close.mjs — standalone recovery stages, never commits (AC-006)', () => {
  it('test_when_standalone_recovery_then_stages_and_prompts', async () => {
    const { tmp, epic } = await makeEpicRepo({
      epic: 'recover-me',
      children: [{ slice: 'A', slug: 'child-a', status: 'committed' }],
    });
    try {
      const headBefore = headCommitCount(tmp);
      const { status, stdout } = runEpicClose(tmp, epic);
      assert.equal(status, 0, 'recovery run succeeds');

      assert.equal(headCommitCount(tmp), headBefore, 'helper creates NO commit of its own');
      assert.match(porcelain(tmp), /^R/m, 'bundle move is staged (renames in the index)');
      assert.match(stdout, /grant-commit/, 'prompts the maintainer to /grant-commit');
      assert.match(stdout, /\/commit/, 'prompts the maintainer to /commit');
    } finally {
      await cleanup(tmp);
    }
  });
});

describe('epic_close.mjs — slices-coverage gate (lazy registration regression)', () => {
  it('test_when_slices_uncovered_by_committed_children_then_noop_despite_registered_committed', async () => {
    // Lazy child registration: the epic declares 5 slices, but only the first
    // slice has registered + committed a child. The old children-only gate saw
    // "every registered child committed" and wrongly closed the epic on the
    // FIRST slice. The slices-coverage gate must keep it in flight.
    const { tmp, epic, statePath } = await makeEpicRepo({
      epic: 'feat-lazy',
      slices: sliceSet('A', 'B', 'C', 'D', 'E'),
      children: [{ slice: 'A', slug: 'child-a', status: 'committed' }],
    });
    try {
      const { status, stdout } = runEpicClose(tmp, epic);
      assert.equal(status, 0, 'lazily-registered epic is a clean no-op (exit 0)');
      assert.match(stdout, /still in flight/i, 'reports still-in-flight');
      assert.match(stdout, /4 of 5/, 'names 4 of 5 slices uncommitted');
      assert.equal(await pathExists(path.join(tmp, 'docs/archive')), false, 'nothing archived');
      const state = await readState(statePath);
      assert.notEqual(state.closed, true, 'epic NOT closed while slices remain uncovered');
    } finally {
      await cleanup(tmp);
    }
  });

  it('test_when_every_slice_has_committed_child_then_closes', async () => {
    const { tmp, epic, statePath } = await makeEpicRepo({
      epic: 'feat-covered',
      slices: sliceSet('A', 'B'),
      children: [
        { slice: 'A', slug: 'child-a', status: 'committed' },
        { slice: 'B', slug: 'child-b', status: 'committed' },
      ],
    });
    try {
      const { status } = runEpicClose(tmp, epic);
      assert.equal(status, 0, 'fully-covered epic closes (exit 0)');
      const bundle = await archivedBundleDir(tmp, epic);
      assert.equal(await pathExists(path.join(bundle, 'spec.md')), true, 'bundle archived when every slice covered');
      const state = await readState(statePath);
      assert.equal(state.closed, true, 'epic state marked closed');
    } finally {
      await cleanup(tmp);
    }
  });

  it('test_when_no_slices_declared_then_falls_back_to_children_gate', async () => {
    // Legacy / no-slice epics carry no slices[]; the close gate must fall back
    // to the registered-children rule so they still close.
    const { tmp, epic, statePath } = await makeEpicRepo({
      epic: 'feat-legacy',
      slices: [],
      children: [{ slice: 'A', slug: 'child-a', status: 'committed' }],
    });
    try {
      const { status } = runEpicClose(tmp, epic);
      assert.equal(status, 0, 'no-slice epic closes via the children-gate fallback (exit 0)');
      const state = await readState(statePath);
      assert.equal(state.closed, true, 'fallback path marks the epic closed');
    } finally {
      await cleanup(tmp);
    }
  });
});
