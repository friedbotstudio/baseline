// Ticket A — decision node model. Covers AC-002 and AC-003 of
// docs/specs/living-system-model-abcd.md (§Behavior #2), plus the two guards that
// keep decision B3 and B4 from collapsing into one exemption.
//
// The defect: .claude/hooks/lib/memory_session_start.mjs:109-124 applies ONE age
// predicate to every category, so a decision with no `superseded-at:` ages out at
// 30 commits even though its expiry is supersession-driven, not time-driven. 26 of
// 30 live decisions read stale for this reason.
//
// RED until categories.mjs exports the supersession-driven class and isStale
// consults it.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';

import { writeShard, tryImport } from './helpers/memory-fixtures.mjs';
import { makeGitProject, advanceCommits } from './helpers/memory-git-fixtures.mjs';

const CATEGORIES_MODULE = '.claude/skills/memory-index/categories.mjs';
const SESSION_MODULE = '.claude/hooks/lib/memory_session_start.mjs';

// A shard stamped `verified-at: <seedSha>` after N further commits is N commits
// behind HEAD — real distance, computed by the same git the hook shells out to.
function seedAgedEntry(category, slug, fields) {
  const project = makeGitProject('mem-supersession-');
  writeShard(project.memDir, category, slug, {
    key: slug,
    fields: { 'verified-at': project.seedSha, 'last-touched': '2026-01-01', ...fields },
  });
  advanceCommits(project.root, 40);
  return project;
}

async function staleKeysFor(project) {
  const mod = await tryImport(SESSION_MODULE);
  assert.ok(mod, `${SESSION_MODULE} must be importable`);
  const envelope = mod.buildIndex({
    memDir: project.memDir,
    projectRoot: project.root,
    sessionSource: 'startup',
  });
  return String(envelope);
}

describe('supersession-driven decay (ticket A)', () => {
  it('test_when_decision_older_than_30_commits_without_superseded_at_then_not_stale', async () => {
    const project = seedAgedEntry('decisions', 'aged-open-decision', {});
    try {
      const rendered = await staleKeysFor(project);
      assert.doesNotMatch(
        rendered,
        /aged-open-decision/,
        'a decision with no superseded-at: must not be reported stale — its expiry is supersession-driven, not age-driven (AC-002)',
      );
    } finally {
      rmSync(project.root, { recursive: true, force: true });
    }
  });

  it('test_when_decision_shard_read_then_load_bearing_present_and_boolean', async () => {
    const categories = await tryImport(CATEGORIES_MODULE);
    assert.ok(categories, `${CATEGORIES_MODULE} must exist and export the decision field contract`);
    assert.equal(
      typeof categories.readLoadBearing,
      'function',
      'categories.mjs must expose readLoadBearing so every reader agrees on the default',
    );
    assert.equal(
      categories.readLoadBearing({ load_bearing: true }),
      true,
      'an explicit load_bearing: true reads as true (AC-003)',
    );
    assert.equal(
      categories.readLoadBearing({ load_bearing: false }),
      false,
      'an explicit load_bearing: false reads as false (AC-003)',
    );
    assert.equal(
      categories.readLoadBearing({}),
      false,
      'an omitted load_bearing: reads as false (incidental), never undefined (AC-003)',
    );
  });

  it('test_when_constraint_older_than_30_commits_then_reported_stale', async () => {
    const project = seedAgedEntry('constraints', 'aged-constraint', { state: 'true' });
    try {
      const rendered = await staleKeysFor(project);
      assert.match(
        rendered,
        /aged-constraint/,
        'a constraint IS mutable and re-verifiable, so age decay still applies to it — decision B3 keeps constraints OUT of the supersession-driven exemption',
      );
    } finally {
      rmSync(project.root, { recursive: true, force: true });
    }
  });

  it('test_when_backlog_entry_ages_then_still_exempt_for_its_own_reason', async () => {
    const categories = await tryImport(CATEGORIES_MODULE);
    assert.ok(categories, `${CATEGORIES_MODULE} must exist`);
    assert.ok(
      categories.STALE_EXEMPT.has('backlog'),
      'backlog stays exempt because intent does not verify against code',
    );
    assert.ok(
      !categories.SUPERSESSION_DRIVEN.has('backlog'),
      'backlog is NOT supersession-driven — decision B4 keeps the two exemptions as separate named constants so neither reason is erased',
    );
    assert.ok(
      categories.SUPERSESSION_DRIVEN.has('decisions'),
      'decisions ARE supersession-driven',
    );
    assert.ok(
      !categories.STALE_EXEMPT.has('decisions'),
      'decisions must not be swept into STALE_EXEMPT_FILES — that would erase why each category is exempt (B4)',
    );
  });
});
