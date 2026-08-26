// scripts/test-ci.sh — the local reproduction of the CI pre-publish gate.
//
// `npm test` on a developer tree is not the CI gate. `obj/template/`, `obj/site/`
// and `.claude/state/**` are gitignored, so the suite locally reads a warm tree
// while the same suite in CI reads a clean checkout plus two builds. Two of the
// recent commits — `fix(ci): make the test suite runnable in a clean checkout`
// and `fix(release): build the shipped template before the suite reads it` —
// are both fixes for that gap, and CI found both because nothing local could.
//
// The script closes it. The load-bearing test here is the step-parity one: a
// local command that claims to run what CI runs is worth nothing the moment the
// two drift, and drift is silent by nature. Pinning the script's step list
// against the workflow's own `run:` lines makes a divergence fail here instead
// of on the next push.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync, constants as fsConstants } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT = path.join(REPO_ROOT, 'scripts/test-ci.sh');
const WORKFLOW = path.join(REPO_ROOT, '.github/workflows/release.yml');

// The workflow's `pre-publish-checks` job, sliced off at the next job so a
// `run:` line from `release` or `deploy-pages` never counts as a gate step.
function prePublishRunSteps() {
  const yaml = readFileSync(WORKFLOW, 'utf8');
  const start = yaml.indexOf('\n  pre-publish-checks:');
  assert.notEqual(start, -1, 'release.yml must declare a pre-publish-checks job');
  const rest = yaml.slice(start + 1);
  const nextJob = rest.slice(1).search(/\n {2}[a-z][\w-]*:\n/);
  const body = nextJob === -1 ? rest : rest.slice(0, nextJob + 1);
  return [...body.matchAll(/^\s*run:\s*(.+)$/gm)].map((m) => m[1].trim());
}

// Commands the script hands to `step`, in order. The script's own steps are
// declared as `step "<name>" ...`, so the name is the command it stands for.
function scriptSteps(body) {
  return [...body.matchAll(/^\s*step\s+"([^"]+)"/gm)].map((m) => m[1].trim());
}

describe('scripts/test-ci.sh — the local CI reproduction', () => {
  it('test_when_the_script_is_looked_for_then_it_exists_and_is_executable', () => {
    assert.ok(existsSync(SCRIPT), 'scripts/test-ci.sh must exist');
    const mode = statSync(SCRIPT).mode;
    assert.ok(
      (mode & fsConstants.S_IXUSR) !== 0,
      'scripts/test-ci.sh must be executable, or `./scripts/test-ci.sh` fails for anyone who runs it directly rather than through `npm run test:ci`',
    );
  });

  it('test_when_ci_runs_a_gate_step_then_the_script_runs_it_too', () => {
    const body = readFileSync(SCRIPT, 'utf8');
    const declared = scriptSteps(body);

    // `npm ci` is spelled with install flags locally; match on the command, not
    // the flag tail, so a `--no-fund` does not read as a missing step.
    const covers = (ciStep) => declared.some((s) => ciStep.startsWith(s) || s.startsWith(ciStep));

    const missing = prePublishRunSteps()
      .filter((s) => s.startsWith('npm '))
      .filter((s) => !covers(s));

    assert.deepEqual(
      missing, [],
      'every `npm` step in release.yml -> pre-publish-checks must appear in scripts/test-ci.sh. '
      + 'A local command that claims to run what CI runs is worth nothing once the two drift, and '
      + `drift is silent. Script declares: ${JSON.stringify(declared)}`,
    );
  });

  it('test_when_the_run_is_set_up_then_it_uses_a_clone_not_the_live_tree', () => {
    const body = readFileSync(SCRIPT, 'utf8');
    assert.match(
      body, /git\s+clone\s/,
      'the run must happen in a clone. A fresh checkout carries tracked files only, which is what '
      + 'keeps a stale obj/ or a leftover .claude/state/ out of the run — running in place would '
      + 'reproduce the warm tree this script exists to escape',
    );
  });

  // A linked worktree is the cheaper isolation, and it was the first thing this
  // script used. It reports itself as linked, and tests/git-workflow-model-detect
  // asserts the repo root is a PRIMARY tree — so the suite failed for a reason
  // that had nothing to do with the change under test. CI checks out a primary
  // tree; a faithful local reproduction has to be one too.
  it('test_when_the_run_is_set_up_then_it_is_a_primary_tree', () => {
    const body = readFileSync(SCRIPT, 'utf8');
    assert.doesNotMatch(
      body, /worktree\s+add/,
      'the run must not use a linked worktree. isPrimaryWorkTree is false inside one, so a test that '
      + 'asserts the repo root is primary fails locally while CI passes. A false red is worse than no '
      + 'local gate, because people learn to ignore it',
    );
  });

  // Structural, like the isolation assertions above, and for the same reason: the
  // script operates on its own repository, so exercising it end to end here would
  // mean running the whole CI sequence inside the suite. The behaviour these two
  // patterns stand in for was verified by running the command: at HEAD it
  // reproduced the live CI failure, and with the carry-over it picked up the
  // uncommitted fix for it.
  it('test_when_the_checkout_is_populated_then_uncommitted_work_is_carried_over', () => {
    const body = readFileSync(SCRIPT, 'utf8');

    assert.match(
      body, /git\s+-C\s+"\$REPO_ROOT"\s+diff\s+HEAD/,
      'tracked modifications must be carried into the checkout. Without this the run reports on '
      + 'the last commit, so someone checking their work before pushing learns nothing about the '
      + 'change they are about to push — which is the failure this script exists to prevent',
    );
    assert.match(
      body, /ls-files\s+--others\s+--exclude-standard/,
      'files the change created must be carried in too, and `--exclude-standard` is what keeps '
      + 'gitignored state out — that exclusion is the whole point of using a fresh checkout',
    );
  });

  it('test_when_a_ref_is_named_then_the_carry_over_is_skipped', () => {
    const body = readFileSync(SCRIPT, 'utf8');
    assert.match(
      body, /CARRY_OVER/,
      'naming an explicit --ref asks for that commit as it stands; mixing the working tree into '
      + 'it would answer a question nobody asked',
    );
  });

  it('test_when_a_step_is_skipped_then_the_pass_line_says_so', () => {
    const body = readFileSync(SCRIPT, 'utf8');
    assert.match(
      body, /SKIPPED:/,
      'a pass that skipped a step must name what it skipped; a silent skip reads as full coverage',
    );
  });

  it('test_when_help_is_requested_then_it_exits_zero', () => {
    const result = spawnSync('bash', [SCRIPT, '--help'], { encoding: 'utf8', timeout: 15000 });
    assert.equal(result.status, 0, `--help must exit 0; got ${result.status}\n${result.stderr}`);
    assert.match(result.stdout, /usage:/, '--help must print usage');
  });
});
