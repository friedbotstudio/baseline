// Tests for the `standup` recap helper: .claude/skills/standup/gather.mjs
//
// Fixtures are real: temp dirs + real `git` invocations + real files on disk
// (no git/fs mocking, per CLAUDE.md VI.3). Foundation helpers build the
// fixtures; the test cases (orchestration) only arrange/act/assert.
//
// Spec traceability (docs/specs/standup-skill.md):
//   AC-001 — release lastTag + commitsSinceTag classified by type
//   AC-002 — aggregate semver bump per .releaserc.json rules
//   AC-003 — upstream pushed-vs-origin state
//   AC-004 — backlog bucketed + epic parent->child nesting
//   AC-005 — pending-questions condensed
//   AC-006 — graceful degradation (no-git / no-tags / missing files)
//   AC-007 — deterministic, clock-free core
//   AC-008 — audit-baseline reconciles at 41 skills
//   AC-009 — session-start buildIndex appends a separate Standup section

import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, copyFileSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// ---- Foundation: paths + module loader ---------------------------------

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, '..');
const GATHER_PATH = join(REPO_ROOT, '.claude/skills/standup/gather.mjs');
const REAL_RELEASERC = join(REPO_ROOT, '.releaserc.json');
const FIXED_NOW = 1700000000000;

async function loadGather() {
  // Dynamic import so this test file is collectable before gather.mjs exists.
  // While the module is absent every test fails RED with ERR_MODULE_NOT_FOUND.
  const mod = await import(GATHER_PATH);
  return mod.gather;
}

// ---- Foundation: fixture builders --------------------------------------

const TEMP_DIRS = [];

function tempDir(prefix) {
  const dir = mkdtempSync(join(tmpdir(), `standup-${prefix}-`));
  TEMP_DIRS.push(dir);
  return dir;
}

function git(cwd, ...args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

function initRepo(dir) {
  git(dir, 'init', '-q');
  git(dir, 'config', 'user.email', 'fixture@example.com');
  git(dir, 'config', 'user.name', 'Fixture');
  git(dir, 'config', 'commit.gpgsign', 'false');
}

function commit(dir, subject, file = 'f.txt') {
  writeFileSync(join(dir, file), `${subject}\n`);
  git(dir, 'add', '.');
  git(dir, 'commit', '-q', '-m', subject);
}

function copyReleaserc(dir) {
  copyFileSync(REAL_RELEASERC, join(dir, '.releaserc.json'));
}

// makeRepo — temp git repo with optional tag, releaserc, and a tracked origin.
function makeRepo({ commits = [], tag = null, releaserc = true, withRemote = false } = {}) {
  const dir = tempDir('repo');
  initRepo(dir);
  if (releaserc) copyReleaserc(dir);
  commit(dir, 'chore: initial', 'init.txt');
  if (tag) git(dir, 'tag', tag);
  for (const subject of commits) commit(dir, subject);
  if (withRemote) {
    const origin = tempDir('origin');
    git(origin, 'init', '-q', '--bare');
    git(dir, 'remote', 'add', 'origin', origin);
    git(dir, 'push', '-q', '-u', 'origin', 'HEAD');
  }
  return dir;
}

function writeMemory(dir, name, body) {
  const memDir = join(dir, '.claude/memory');
  mkdirSync(memDir, { recursive: true });
  writeFileSync(join(memDir, name), body);
}

function bumpOf(recap, subjectFragment) {
  const c = recap.release.commitsSinceTag.find((x) => x.subject.includes(subjectFragment));
  assert.ok(c, `expected a commit matching "${subjectFragment}"`);
  return c.bump;
}

after(() => {
  for (const dir of TEMP_DIRS) rmSync(dir, { recursive: true, force: true });
});

// ---- Orchestration: the scenarios --------------------------------------

describe('standup gather — release classification', () => {
  it('test_when_tagged_repo_with_feat_fix_chore_then_classified_and_bump_minor', async () => {
    const gather = await loadGather();
    const dir = makeRepo({ tag: 'v0.1.0', commits: ['feat: a', 'fix: b', 'chore(release): c'] });

    const recap = await gather({ rootDir: dir, now: FIXED_NOW });

    assert.equal(recap.release.lastTag, 'v0.1.0');
    const types = recap.release.commitsSinceTag.map((c) => c.type).sort();
    assert.deepEqual(types, ['chore', 'feat', 'fix']);
    assert.equal(recap.release.aggregateBump, 'minor');
  });

  it('test_when_rule_edge_commits_then_per_commit_and_aggregate_bump_per_releaserc', async () => {
    const gather = await loadGather();
    const dir = makeRepo({ tag: 'v0.1.0', commits: ['refactor: x', 'chore(release): y', 'feat(constitution): z'] });

    const recap = await gather({ rootDir: dir, now: FIXED_NOW });

    assert.equal(bumpOf(recap, 'refactor: x'), 'patch');
    assert.equal(bumpOf(recap, 'chore(release): y'), 'none');
    assert.equal(bumpOf(recap, 'feat(constitution): z'), 'minor');
    assert.equal(recap.release.aggregateBump, 'minor');
  });
});

describe('standup gather — upstream delta', () => {
  it('test_when_local_ahead_of_origin_then_upstream_ahead_else_no_upstream', async () => {
    const gather = await loadGather();

    const ahead = makeRepo({ tag: 'v0.1.0', withRemote: true });
    commit(ahead, 'feat: ahead one');
    commit(ahead, 'feat: ahead two');
    const recapAhead = await gather({ rootDir: ahead, now: FIXED_NOW });
    assert.equal(recapAhead.release.upstream.state, 'ahead');
    assert.equal(recapAhead.release.upstream.ahead, 2);

    const lonely = makeRepo({ tag: 'v0.1.0' });
    const recapLonely = await gather({ rootDir: lonely, now: FIXED_NOW });
    assert.equal(recapLonely.release.upstream.state, 'no-upstream');
  });
});

describe('standup gather — backlog buckets + epic nesting', () => {
  it('test_when_backlog_has_statuses_and_epic_then_bucketed_and_nested', async () => {
    const gather = await loadGather();
    const dir = makeRepo({ tag: 'v0.1.0' });
    writeMemory(dir, 'backlog.md', [
      '# Backlog', '',
      '## epic-aaaa', '> verbatim', '- status: open', '',
      '## child-bbbb', '- parent: epic-aaaa', '- status: picked-up', '',
      '## child-cccc', '- parent: epic-aaaa', '- status: dropped', '',
      '## solo-dddd', '- status: open', '',
    ].join('\n'));

    const recap = await gather({ rootDir: dir, now: FIXED_NOW });

    const keys = (b) => b.map((e) => e.key).sort();
    assert.deepEqual(keys(recap.backlog.open), ['epic-aaaa', 'solo-dddd']);
    assert.deepEqual(keys(recap.backlog.pickedUp), ['child-bbbb']);
    assert.deepEqual(keys(recap.backlog.dropped), ['child-cccc']);

    const epic = recap.backlog.open.find((e) => e.key === 'epic-aaaa');
    const childKeys = epic.children.map((c) => c.key).sort();
    assert.deepEqual(childKeys, ['child-bbbb', 'child-cccc']);
  });
});

describe('standup gather — pending questions', () => {
  it('test_when_pending_questions_present_then_condensed', async () => {
    const gather = await loadGather();
    const dir = makeRepo({ tag: 'v0.1.0' });
    writeMemory(dir, 'pending-questions.md', [
      '# Pending questions', '',
      '## Q-002', '- Question: Should rollout prereqs require an enforcement AC?', '- Blocker for: amending the spec skill', '',
      '## Q-007', '- Question: Should next-q-id.mjs be a landmark?', '- Blocker for: nothing critical', '',
    ].join('\n'));

    const recap = await gather({ rootDir: dir, now: FIXED_NOW });

    const q2 = recap.pendingQuestions.find((q) => q.id === 'Q-002');
    assert.ok(q2, 'expected Q-002');
    assert.ok(q2.question.length > 0);
    assert.ok(q2.blocker.length > 0);
    assert.ok(recap.pendingQuestions.find((q) => q.id === 'Q-007'), 'expected Q-007');
  });
});

describe('standup gather — graceful degradation', () => {
  it('test_when_non_git_or_no_tags_or_missing_files_then_degraded_no_throw', async () => {
    const gather = await loadGather();

    const empty = tempDir('empty');
    const recapEmpty = await gather({ rootDir: empty, now: FIXED_NOW });
    assert.ok(recapEmpty.degraded.includes('no-git'), 'expected no-git');

    const noTags = tempDir('notags');
    initRepo(noTags);
    commit(noTags, 'chore: only commit', 'a.txt');
    const recapNoTags = await gather({ rootDir: noTags, now: FIXED_NOW });
    assert.ok(recapNoTags.degraded.includes('no-tags'), 'expected no-tags');
    assert.ok(recapNoTags.degraded.includes('no-backlog'), 'expected no-backlog');
  });
});

describe('standup gather — determinism', () => {
  it('test_when_run_twice_with_fixed_now_then_deep_equal', async () => {
    const gather = await loadGather();
    const dir = makeRepo({ tag: 'v0.1.0', commits: ['feat: a', 'fix: b'] });

    const a = await gather({ rootDir: dir, now: FIXED_NOW });
    const b = await gather({ rootDir: dir, now: FIXED_NOW });
    assert.deepEqual(a, b);
  });

  it('test_when_gather_source_then_no_clock_calls_in_core', () => {
    assert.ok(existsSync(GATHER_PATH), 'gather.mjs must exist');
    const src = readFileSync(GATHER_PATH, 'utf8');
    assert.ok(!src.includes('Date.now('), 'gather.mjs must not call Date.now() (clock-free core)');
    assert.ok(!src.includes('new Date('), 'gather.mjs must not call new Date() (clock-free core)');
  });
});

describe('standup governance — audit reconciles at 41', () => {
  it('test_when_skill_and_helper_land_then_audit_baseline_exits_zero_at_41', () => {
    // AC-008. Exercises the live repo (not a fixture): the count cascade must reconcile.
    execFileSync('node', ['.claude/skills/audit-baseline/audit.mjs'], { cwd: REPO_ROOT, stdio: 'pipe' });
    // execFileSync throws on non-zero exit; reaching here means audit exited 0.
  });
});

describe('standup session-start integration', () => {
  it('test_when_buildindex_runs_then_appends_separate_standup_section', async () => {
    // AC-009. buildIndex must append a delimited Standup section distinct from
    // the resume snapshot, built from the same gather core.
    const { buildIndex } = await import(join(REPO_ROOT, '.claude/hooks/lib/memory_session_start.mjs'));
    const envelope = buildIndex({
      memDir: join(REPO_ROOT, '.claude/memory'),
      projectRoot: REPO_ROOT,
      sessionSource: 'startup',
    });
    const out = JSON.parse(envelope).hookSpecificOutput.additionalContext;
    assert.match(out, /\n## Standup\n/, 'session-start output must contain a delimited Standup section');
    assert.match(out, /Run `\/standup` for the full recap/, 'Standup section must point at /standup for the full recap');
  });
});
