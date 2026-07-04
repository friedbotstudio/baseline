import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CLI = join(ROOT, 'bin/cli.js');
const CI_POSTURE_MODULE = join(ROOT, 'src/cli/ci-posture.js');

const EXPECTED_POSTURE_PATHS = [
  '.githooks/pre-commit',
  '.github/branch-protection/main.json',
  'scripts/ci/apply-branch-protection.mjs',
  'scripts/ci/low-risk-classifier.mjs',
  'scripts/ci/require-gitleaks.sh',
];

async function importCiPosture() {
  return import(CI_POSTURE_MODULE);
}

async function writeJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(value, null, 2) + '\n');
}

// Minimal obj/template-shaped fixture: the 5 posture artifacts plus the
// non-posture files freshInstall touches (project.json is SPECIAL_MERGE).
async function makeTemplateFixture() {
  const tpl = await mkdtemp(join(tmpdir(), 'ci-posture-tpl-'));
  await writeFile(join(tpl, 'CLAUDE.md'), '# baseline\n');
  await writeJson(join(tpl, '.claude/project.json'), {
    configured: false,
    ci_posture: { enabled: true },
  });
  await mkdir(join(tpl, '.githooks'), { recursive: true });
  await writeFile(join(tpl, '.githooks/pre-commit'), '#!/usr/bin/env bash\n# baseline pre-commit\n');
  await mkdir(join(tpl, 'scripts/ci'), { recursive: true });
  await writeFile(join(tpl, 'scripts/ci/require-gitleaks.sh'), '#!/usr/bin/env bash\n');
  await writeFile(join(tpl, 'scripts/ci/low-risk-classifier.mjs'), 'export {};\n');
  await writeFile(join(tpl, 'scripts/ci/apply-branch-protection.mjs'), 'export {};\n');
  await writeJson(join(tpl, '.github/branch-protection/main.json'), {
    required_status_checks: { strict: false, contexts: ['REPLACE-WITH-YOUR-CI-CHECK-CONTEXT'] },
  });
  return tpl;
}

describe('ci-posture — shipped path set + knob reader (AC-013)', () => {
  it('test_ci_posture_paths_covers_exactly_the_shipped_artifacts', async () => {
    const { CI_POSTURE_PATHS } = await importCiPosture();
    assert.deepEqual([...CI_POSTURE_PATHS].sort(), EXPECTED_POSTURE_PATHS);
  });

  it('test_knob_reader_defaults_open_and_respects_false', async () => {
    const { readCiPostureEnabled } = await importCiPosture();
    const target = await mkdtemp(join(tmpdir(), 'ci-posture-knob-'));
    try {
      assert.equal(await readCiPostureEnabled(target), true, 'missing project.json → enabled (default-on)');
      await writeJson(join(target, '.claude/project.json'), { configured: false });
      assert.equal(await readCiPostureEnabled(target), true, 'absent knob → enabled');
      await writeJson(join(target, '.claude/project.json'), { ci_posture: { enabled: false } });
      assert.equal(await readCiPostureEnabled(target), false, 'enabled:false → opted out');
      await writeJson(join(target, '.claude/project.json'), { ci_posture: { enabled: true } });
      assert.equal(await readCiPostureEnabled(target), true);
    } finally {
      await rm(target, { recursive: true, force: true });
    }
  });
});

describe('ci-posture — install delivery seam (AC-013)', () => {
  let tpl;

  before(async () => {
    tpl = await makeTemplateFixture();
  });

  after(async () => {
    if (tpl) await rm(tpl, { recursive: true, force: true });
  });

  it('test_when_default_install_then_posture_delivered_and_knob_true', async () => {
    const { freshInstall } = await import(join(ROOT, 'src/cli/install.js'));
    const target = await mkdtemp(join(tmpdir(), 'ci-posture-target-'));
    try {
      await freshInstall(tpl, target);
      for (const rel of EXPECTED_POSTURE_PATHS) {
        assert.ok(existsSync(join(target, rel)), `default install must deliver ${rel}`);
      }
      const projectJson = JSON.parse(await readFile(join(target, '.claude/project.json'), 'utf8'));
      assert.equal(projectJson.ci_posture?.enabled, true, 'default install leaves the knob true');
    } finally {
      await rm(target, { recursive: true, force: true });
    }
  });

  it('test_when_no_ci_posture_install_then_nothing_delivered_and_knob_false', async () => {
    const { freshInstall } = await import(join(ROOT, 'src/cli/install.js'));
    const target = await mkdtemp(join(tmpdir(), 'ci-posture-optout-'));
    try {
      await freshInstall(tpl, target, { ciPosture: false });
      for (const rel of EXPECTED_POSTURE_PATHS) {
        assert.ok(!existsSync(join(target, rel)), `opt-out install must NOT deliver ${rel}`);
      }
      const projectJson = JSON.parse(await readFile(join(target, '.claude/project.json'), 'utf8'));
      assert.equal(projectJson.ci_posture?.enabled, false, 'opt-out install stamps the knob false');
    } finally {
      await rm(target, { recursive: true, force: true });
    }
  });
});

describe('ci-posture — upgrade respects the knob (AC-013)', () => {
  it('test_when_upgrade_of_opted_out_project_then_never_redelivers_never_touches_consumer_hooks', async () => {
    const { threeWayMerge } = await import(join(ROOT, 'src/cli/merge.js'));
    const { buildManifestFromDir } = await import(join(ROOT, 'src/cli/manifest.js'));
    const tplDir = await mkdtemp(join(tmpdir(), 'ci-posture-up-tpl-'));
    const target = await mkdtemp(join(tmpdir(), 'ci-posture-up-tgt-'));
    try {
      await mkdir(join(tplDir, '.githooks'), { recursive: true });
      await writeFile(join(tplDir, '.githooks/pre-commit'), '#!/usr/bin/env bash\n# baseline hook v2\n');
      await mkdir(join(tplDir, 'scripts/ci'), { recursive: true });
      await writeFile(join(tplDir, 'scripts/ci/require-gitleaks.sh'), '#!/usr/bin/env bash\n# v2\n');
      await writeFile(join(tplDir, 'docs-note.md'), 'unrelated baseline file\n');

      const consumerHook = '#!/usr/bin/env bash\n# the consumer\'s own pre-commit — hands off\n';
      await mkdir(join(target, '.githooks'), { recursive: true });
      await writeFile(join(target, '.githooks/pre-commit'), consumerHook);
      await writeJson(join(target, '.claude/project.json'), { ci_posture: { enabled: false } });

      const tplFiles = ['.githooks/pre-commit', 'scripts/ci/require-gitleaks.sh', 'docs-note.md'];
      const newManifest = await buildManifestFromDir(tplDir, tplFiles, { baseline_version: '9.9.9' });
      const oldManifest = { files: {}, baseline_version: '9.9.8' };

      const report = await threeWayMerge(tplDir, target, oldManifest, newManifest);

      const postureActions = report.actions.filter(
        (a) => a.path === '.githooks/pre-commit' || a.path.startsWith('scripts/ci/'),
      );
      const deliveringKinds = postureActions.filter((a) =>
        ['ADD', 'OVERWRITE', 'PRUNE'].includes(a.kind),
      );
      assert.deepEqual(
        deliveringKinds,
        [],
        `opted-out upgrade must not deliver or prune posture paths, saw: ${JSON.stringify(postureActions)}`,
      );
      assert.equal(
        await readFile(join(target, '.githooks/pre-commit'), 'utf8'),
        consumerHook,
        'the consumer\'s own hook must be byte-identical after upgrade',
      );
      assert.ok(!existsSync(join(target, 'scripts/ci/require-gitleaks.sh')), 'no posture artifact re-delivered');
      assert.ok(existsSync(join(target, 'docs-note.md')), 'non-posture baseline files still merge normally');
    } finally {
      await rm(tplDir, { recursive: true, force: true });
      await rm(target, { recursive: true, force: true });
    }
  });
});

describe('ci-posture — CLI flag surface (AC-013)', () => {
  it('test_cli_exposes_no_ci_posture_flag', () => {
    const r = spawnSync('node', [CLI, '--help'], { encoding: 'utf8' });
    assert.equal(r.status, 0);
    assert.match(
      r.stdout + r.stderr,
      /--no-ci-posture/,
      'HELP_TEXT must document the --no-ci-posture opt-out flag',
    );
  });
});
