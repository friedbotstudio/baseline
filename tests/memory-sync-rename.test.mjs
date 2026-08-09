// T4 — the flush skill becomes memory-sync (AC-009, AC-010).
//
// AC-009 is the behavioural half: the skill must still do its job under the new
// name. AC-010 is the sweep half — 155 files were measured as carrying the old
// name, and a rename that leaves live references behind is worse than no rename,
// because it splits the vocabulary in two.
//
// The sweep EXCLUDES docs/archive/** and CHANGELOG.md. Those are historical
// records of workflows that really did run the old command; rewriting them would
// falsify the record rather than complete the rename.
//
// The needle is ASSEMBLED rather than written out. A file that searches for a
// literal string necessarily contains that string, so a spelled-out needle would
// make this suite report itself as the last remaining offender — a check that can
// never go green is a check nobody keeps.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

import { REPO_ROOT, readFileSync, existsSync } from './helpers/memory-fixtures.mjs';
import { runCli, assertPresent } from './helpers/cli-runner.mjs';

const OLD = ['memory', 'flush'].join('-');
const OLD_SNAKE = ['memory', 'flush'].join('_');
const NEW = ['memory', 'sync'].join('-');

const NEW_SKILL_DIR = `.claude/skills/${NEW}`;
const OLD_SKILL_DIR = `.claude/skills/${OLD}`;

const HISTORICAL = [/^docs\/archive\//, /^CHANGELOG\.md$/, /^obj\//];

// The rename MAP has to name both sides — that is what makes it a map. Excluding
// it by exact path rather than by pattern keeps the exemption to these two files
// (the src/ source and its build mirror) so nothing else can hide behind it.
const RENAME_MAP = [
  'src/cli/workflow-migrator.js',
  '.claude/skills/harness/workflow-migrator.js',
];

function trackedFiles() {
  return execFileSync('git', ['ls-files'], { cwd: REPO_ROOT, encoding: 'utf8' })
    .split('\n')
    .filter(Boolean)
    .filter((p) => !HISTORICAL.some((re) => re.test(p)))
    .filter((p) => !RENAME_MAP.includes(p));
}

function carriesOldName(rel) {
  try {
    const text = readFileSync(join(REPO_ROOT, rel), 'utf8');
    return text.includes(OLD) || text.includes(OLD_SNAKE);
  } catch {
    return false;
  }
}

describe('flush skill rename', () => {
  // AC-009
  it('test_when_memory_sync_invoked_then_skill_curates_canonical_memory', () => {
    assert.ok(existsSync(join(REPO_ROOT, NEW_SKILL_DIR)), `${NEW_SKILL_DIR}/ must exist — the rename moves the directory, it does not alias it`);
    assert.ok(existsSync(join(REPO_ROOT, `${NEW_SKILL_DIR}/SKILL.md`)), 'the renamed skill keeps its SKILL.md');
    assert.ok(existsSync(join(REPO_ROOT, `${NEW_SKILL_DIR}/cli.mjs`)), 'the renamed skill keeps its CLI front door');
    // No `.claude/commands/` entry is asserted: this skill has never had one.
    // That directory holds the three consent gates plus init-project, and the
    // flush skill is reached through Skill invocation, not a slash command file.
    assert.ok(!existsSync(join(REPO_ROOT, OLD_SKILL_DIR)), 'the old skill directory must be GONE — a transitional alias is an explicit non-goal');

    const res = runCli(NEW, ['--help']);
    assertPresent(assert, res);
    assert.equal(res.status, 0, `${NEW} --help must exit 0; stderr: ${res.stderr}`);
  });

  // AC-010
  it('test_when_tree_searched_then_no_live_memory_flush_reference_remains', () => {
    const offenders = trackedFiles().filter(carriesOldName);
    assert.deepEqual(
      offenders,
      [],
      `every live reference must be renamed; ${offenders.length} file(s) still carry the old name:\n  ${offenders.slice(0, 25).join('\n  ')}`,
    );
  });
});
