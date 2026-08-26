// The code-review gate's input measurement — four defects that make it review less
// than it reports.
//
// RED until the probes are widened. Every scenario that asks what git omits drives the
// REAL git binary against a real temp repo. The two tests that already cover
// `assembleChangedFiles` (tests/checker-fanout.test.mjs:165, tests/changedfiles-shape-
// contract.test.mjs) stub `exec` with a canned string, which is exactly why a probe that
// never listed created files survived them: a stub answers with whatever you hand it.
//
// Stubs appear here only where the scenario is about a probe FAILING, which a real repo
// cannot be made to do on demand.
//
// Backlog: untracked-files-are-invisible-to-every-code-review-checker-7f21,
// fanout-changedfiles-omits-untracked-files-6b07,
// swarm-wave-audit-collapses-untracked-dirs-4c19,
// a-pipe-in-a-filename-removes-its-row-from-the-review-gate-5c04.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ASSEMBLER = join(REPO_ROOT, '.claude/skills/harness/assemble-context.mjs');
const SIMPLIFY_ORACLE = join(REPO_ROOT, '.claude/skills/simplify/oracle.mjs');
const WAVE_AUDIT = join(REPO_ROOT, '.claude/skills/swarm-dispatch/swarm_wave_audit.mjs');

// Node caches ESM by URL; every scenario wants a fresh evaluation of the module under
// test, so the query string differs per import.
function freshImport(file) {
  return import(`${pathToFileURL(file).href}?t=${Date.now()}-${Math.random()}`);
}

async function tmpGitRepo(prefix) {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  execFileSync('git', ['init', '-q'], { cwd: dir });
  execFileSync('git', ['config', 'user.email', 't@example.com'], { cwd: dir });
  execFileSync('git', ['config', 'user.name', 'test'], { cwd: dir });
  return dir;
}

async function commitFile(dir, relPath, body) {
  const abs = join(dir, relPath);
  await mkdir(dirname(abs), { recursive: true });
  await writeFile(abs, body);
  execFileSync('git', ['add', '--', relPath], { cwd: dir });
  execFileSync('git', ['-c', 'commit.gpgsign=false', 'commit', '-qm', `add ${relPath}`], { cwd: dir });
}

// A newline is a legal filename byte on macOS and Linux, but not everywhere this suite
// may run. Probing once keeps the scenario honest rather than silently absent.
// The probe writes inside a `mkdtempSync` directory rather than at a PID-derived name in
// the shared tmpdir. A guessable name lets another user on the machine pre-create a
// symlink there, and the write then truncates whatever it points at (CWE-377).
function newlinePathsSupported() {
  let dir;
  try {
    dir = mkdtempSync(join(tmpdir(), 'nl-probe-'));
    writeFileSync(join(dir, 'a\nb'), '');
    return true;
  } catch {
    return false;
  } finally {
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
}
const NEWLINE_SKIP = newlinePathsSupported() ? false : 'filesystem rejects a newline in a filename';

describe('assemble-context — a file the change created reaches the checkers', () => {
  it('test_when_a_change_creates_a_file_then_the_probe_lists_it', async () => {
    const { assembleChangedFiles } = await freshImport(ASSEMBLER);
    const dir = await tmpGitRepo('probe-created-');
    await commitFile(dir, 'tracked.mjs', 'export const a = 1;\n');
    await writeFile(join(dir, 'tracked.mjs'), 'export const a = 2;\n');
    await writeFile(join(dir, 'created.mjs'), 'export const b = 1;\n');

    const paths = assembleChangedFiles({ rootDir: dir });

    assert.ok(
      paths.includes('created.mjs'),
      'a file this change created must reach the code-review checkers; `git diff --name-only HEAD` '
      + `lists tracked modifications only, so it never has. Probe returned: ${JSON.stringify(paths)}`,
    );
    assert.ok(paths.includes('tracked.mjs'), 'the tracked modification must still be listed');
  });

  it('test_when_a_path_contains_a_newline_then_the_probe_keeps_it_whole', { skip: NEWLINE_SKIP }, async () => {
    const { assembleChangedFiles } = await freshImport(ASSEMBLER);
    const dir = await tmpGitRepo('probe-newline-');
    const weird = 'we\nird.mjs';
    await commitFile(dir, weird, 'export const a = 1;\n');
    await writeFile(join(dir, weird), 'export const a = 2;\n');

    const paths = assembleChangedFiles({ rootDir: dir });

    assert.ok(
      paths.includes(weird),
      'git quotes a path containing a newline and `.split("\\n")` then cuts it into fragments '
      + `that fail their read and are dropped. Probe returned: ${JSON.stringify(paths)}`,
    );
  });

  it('test_when_a_created_file_reaches_the_fanout_then_its_prior_is_null', async () => {
    const { assembleContext } = await freshImport(ASSEMBLER);
    const dir = await tmpGitRepo('probe-prior-');
    await commitFile(dir, 'tracked.mjs', 'export const a = 1;\n');
    await writeFile(join(dir, 'created.mjs'), 'export const b = 1;\n');

    const { changedFiles } = assembleContext({ rootDir: dir });
    const created = changedFiles.find((f) => f.path === 'created.mjs');

    assert.ok(created, 'the created file must be hydrated into ctx.changedFiles');
    assert.equal(created.prior, null,
      'prior is what code-structure reads to decide BLOCKER vs ADVISORY; a created file has no '
      + 'HEAD version, so null is the new-file signal the severity branch needs');
    assert.equal(created.content, 'export const b = 1;\n', 'content must be the bytes on disk');
  });
});

describe('assemble-context — a short input must not read as a complete one', () => {
  it('test_when_one_probe_fails_and_another_succeeds_then_input_state_is_partial', async () => {
    const { assembleContext } = await freshImport(ASSEMBLER);

    const execHalfBroken = (_rootDir, args) => {
      if (args.includes('ls-files')) throw new Error('probe unavailable');
      if (args[0] === 'show') return 'export const a = 1;\n';
      return 'tracked.mjs\0';
    };

    const { inputState } = assembleContext({
      rootDir: '/nonexistent',
      exec: execHalfBroken,
      readFile: () => 'export const a = 2;\n',
    });

    assert.equal(inputState, 'partial',
      'a review that saw the tracked half and lost the created half currently reports `measured`, '
      + 'which is indistinguishable from having seen everything');
  });

  it('test_when_every_probe_fails_then_input_state_stays_no_input', async () => {
    const { assembleChangedFiles, describeInputState } = await freshImport(ASSEMBLER);

    const paths = assembleChangedFiles({
      rootDir: '/nonexistent',
      exec: () => { throw new Error('git exploded'); },
    });

    assert.deepEqual(paths, [], 'a failed probe yields no paths');
    assert.equal(describeInputState(paths, { probeFailed: true }), 'no-input',
      'widening the probe must not reopen the case tests/checker-fanout.test.mjs:178 pins');
  });
});

describe('swarm wave audit — a wave that creates a directory', () => {
  it('test_when_a_wave_creates_a_new_directory_then_the_audit_lists_its_files', async () => {
    const dir = await tmpGitRepo('wave-audit-');
    await commitFile(dir, 'seed.txt', 'seed\n');

    // Committed, so the audit's own fixture never shows up as a wave change and the
    // only dirty path is the directory the wave created.
    const planPath = join(dir, '.claude/state/swarm/plan.json');
    await commitFile(dir, '.claude/state/swarm/plan.json', JSON.stringify({ tasks: [], waves: [] }));
    await commitFile(
      dir,
      '.claude/state/swarm/active_wave.json',
      JSON.stringify({
        isolation: 'shared',
        pre_wave_changed: [],
        write_sets: [{ task_id: 't1', files: ['newdir/one.mjs', 'newdir/two.mjs'] }],
      }),
    );

    await mkdir(join(dir, 'newdir'), { recursive: true });
    await writeFile(join(dir, 'newdir/one.mjs'), 'export const a = 1;\n');
    await writeFile(join(dir, 'newdir/two.mjs'), 'export const b = 1;\n');

    const result = spawnSync('node', [WAVE_AUDIT, planPath, '0'], {
      cwd: dir,
      encoding: 'utf8',
      timeout: 15000,
      env: { ...process.env, CLAUDE_PROJECT_DIR: dir },
    });

    assert.equal(result.status, 0,
      '`git status --porcelain` collapses a wholly-new untracked directory to one path string '
      + '(`newdir/`), which never matches a union write_set that lists files. A correct plan then '
      + `false-fails its wave.\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
  });
});

describe('simplify oracle — a path a pipe cannot hide', () => {
  it('test_when_a_flagged_row_names_a_path_with_a_pipe_then_the_oracle_emits_a_finding', async () => {
    const { runSimplifyOracle } = await freshImport(SIMPLIFY_ORACLE);

    const table = [
      '| file | verdict | reason |',
      '|---|---|---|',
      '| a|b.mjs | flagged | duplicated parse helper |',
    ].join('\n');

    const { findings } = runSimplifyOracle({ simplifyTable: table });

    assert.equal(findings.length, 1,
      'splitting the row on `|` shifts every cell right, so cell 1 holds a path fragment instead '
      + 'of `flagged` and the row is skipped. A file the reviewer explicitly flagged then leaves '
      + 'the gate with zero findings.');
    assert.ok(findings[0].file.includes('a|b.mjs'),
      `the finding must name the whole path, got: ${findings[0].file}`);
  });

  it('test_when_a_flagged_row_has_no_reason_then_it_still_blocks', async () => {
    const { runSimplifyOracle } = await freshImport(SIMPLIFY_ORACLE);

    const table = [
      '| file | verdict | reason |',
      '|---|---|---|',
      '| plain.mjs | flagged |  |',
    ].join('\n');

    const { findings } = runSimplifyOracle({ simplifyTable: table });

    assert.equal(findings.length, 1,
      'AC-009 closed the case where an unreasoned flag emitted nothing at all; widening the '
      + 'parser for pipes must not reopen it');
    assert.equal(findings[0].severity, 'BLOCKER',
      'an unprefixed flag blocks — only an `inherited:` reason downgrades to ADVISORY');
  });
});

describe('review skills — the prose instructs a probe that can see a created file', () => {
  for (const rel of ['.claude/skills/security/SKILL.md', '.claude/skills/document/SKILL.md']) {
    it(`test_when_${rel.replace(/[^\w]/g, '_')}_documents_its_diff_probe_then_it_covers_created_files`, async () => {
      const { readFile } = await import('node:fs/promises');
      const body = await readFile(join(REPO_ROOT, rel), 'utf8');

      assert.match(body, /untracked/i,
        `${rel} instructs a bare \`git diff\` survey. That command lists tracked modifications `
        + 'only, so a reviewer following the instruction literally never opens a file the change '
        + 'created — which under TDD is most of the change.');
    });
  }
});
