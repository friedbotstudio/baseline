// T1 — standup answers its whole recap in one pass (AC-001, AC-003).
//
// The defect these defend: standup/SKILL.md documented four StandupRecap keys
// while gatherSync returned six, so `releaseModel` and `roadmap` were gathered
// and then re-derived by hand. The CLI front door is what makes "one call ends
// it" checkable rather than aspirational.
//
// Every test opens with assertPresent(). A dispatcher that does not exist makes
// node exit 1, which is also an unknown subcommand's exit code — without the
// presence check these would pass vacuously against an absent file.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { REPO_ROOT, tryImport, readFileSync } from './helpers/memory-fixtures.mjs';
import { runCli, runCliJson, assertPresent } from './helpers/cli-runner.mjs';

const STANDUP_CLI = 'standup';
const GATHER = '.claude/skills/standup/gather.mjs';

const RECAP_KEYS = ['release', 'releaseModel', 'backlog', 'pendingQuestions', 'roadmap', 'degraded'];

function bareGitRepo() {
  const dir = mkdtempSync(join(tmpdir(), 'standup-bare-'));
  execFileSync('git', ['init', '-q'], { cwd: dir });
  mkdirSync(join(dir, '.claude'), { recursive: true });
  writeFileSync(join(dir, '.claude/project.json'), JSON.stringify({ configured: true }));
  return dir;
}

describe('standup CLI recap', () => {
  // AC-001
  it('test_when_cli_recap_json_runs_once_then_all_six_recap_keys_present', () => {
    const res = runCliJson(STANDUP_CLI, ['recap', '--json']);
    assertPresent(assert, res);
    assert.equal(res.status, 0, `recap --json must exit 0; stderr: ${res.stderr}`);
    for (const key of RECAP_KEYS) {
      assert.ok(
        Object.prototype.hasOwnProperty.call(res.json, key),
        `one invocation must return every documented key; \`${key}\` is missing — this is the "3-4 passes" defect`,
      );
    }
  });

  // AC-001, AC-003 — boundary: every source missing at once.
  it('test_when_repo_has_no_tags_no_roadmap_no_memory_then_degraded_names_each_and_exit_is_zero', () => {
    const dir = bareGitRepo();
    const res = runCliJson(STANDUP_CLI, ['recap', '--json', '--root', dir]);
    assertPresent(assert, res);
    assert.equal(res.status, 0, 'a repo missing every source degrades; it never exits non-zero');
    assert.ok(Array.isArray(res.json.degraded), 'degraded must be an array');
    assert.ok(
      res.json.degraded.includes('no-roadmap-plan'),
      `an absent roadmap must be NAMED in degraded[], not rendered as a silent blank; got ${JSON.stringify(res.json.degraded)}`,
    );
  });

  // AC-001 — regression: the CLI adds a caller, not a field.
  it('test_when_gather_sync_runs_after_t1_then_recap_shape_is_unchanged', async () => {
    const mod = await tryImport(GATHER);
    assert.ok(mod, `${GATHER} must remain importable — the CLI composes it, it is not replaced`);
    assert.equal(typeof mod.gatherSync, 'function', 'gatherSync stays the collector entry point');

    const recap = mod.gatherSync({ rootDir: REPO_ROOT });
    assert.deepEqual(
      Object.keys(recap).sort(),
      [...RECAP_KEYS].sort(),
      'gatherSync returns exactly the six documented keys — T1 documents them, it does not add or drop any',
    );
  });

  // AC-001 — the SKILL.md is the surface that actually drifted. Added to the
  // recipe during scenario authoring: ticket T1's text is "standup SKILL.md
  // documents all six StandupRecap keys", and no recipe row covered it, so
  // AC-001 was only half-tested. Recorded in the tdd state file's recipe[].
  it('test_when_standup_skill_read_then_it_documents_all_six_recap_keys', () => {
    const res = runCli(STANDUP_CLI, ['--help']);
    assertPresent(assert, res);

    const skill = readFileSync(join(REPO_ROOT, '.claude/skills/standup/SKILL.md'), 'utf8');
    for (const key of RECAP_KEYS) {
      assert.ok(
        skill.includes(key),
        `standup/SKILL.md must document \`${key}\` — documenting four of six is the drift that forced the extra passes`,
      );
    }
  });
});
