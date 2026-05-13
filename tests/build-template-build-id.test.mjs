// Build-id stamping in obj/template/manifest.json (AC-009 manifest portion).
//
// Two tests:
//   1. With GITHUB_RUN_ID=<value>, scripts/build-template.sh stamps the
//      manifest's top-level `build_id` as "gha-<value>".
//   2. Without GITHUB_RUN_ID, the manifest has NO `build_id` key (key absent
//      entirely — keeps dev manifests byte-identical to the pre-change shape,
//      so template-payload / template-drift / manifest tests stay green).
//
// Fixture: minimal project-root copy in a tmpdir, mirroring the pattern in
// tests/build-template.test.mjs:makeFixture(). PKG_ROOT env override points
// the script at the fixture so the real obj/template/ is never touched.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, mkdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const BUILD_SCRIPT = new URL('../scripts/build-template.sh', import.meta.url).pathname;

// Minimal fixture project root. Mirrors tests/build-template.test.mjs's
// makeFixture(); kept local because this suite asserts on a specific
// manifest-level key the upstream fixture helper doesn't surface.
async function makeFixture() {
  const root = await mkdtemp(join(tmpdir(), 'build-template-build-id-'));

  await writeFile(join(root, 'CLAUDE.md'), 'LIVE CLAUDE CONTENT');
  await writeFile(join(root, '.mcp.json'), '{}');
  await mkdir(join(root, 'docs', 'init'), { recursive: true });
  await writeFile(join(root, 'docs', 'init', 'seed.md'), 'LIVE SEED CONTENT');

  await mkdir(join(root, '.claude'), { recursive: true });
  await writeFile(join(root, '.claude', 'project.json'), '{"configured":false}');
  await writeFile(join(root, '.claude', 'settings.json'), '{}');

  await mkdir(join(root, 'src', 'agents'), { recursive: true });
  await mkdir(join(root, 'src', 'memory'), { recursive: true });
  await writeFile(join(root, 'src', 'CLAUDE.template.md'), 'TEMPLATE CLAUDE CONTENT');
  await writeFile(join(root, 'src', 'seed.template.md'), 'TEMPLATE SEED CONTENT');
  await writeFile(join(root, 'src', 'project.template.json'), '{"configured":false,"template":true}');
  await writeFile(join(root, 'src', '.mcp.template.json'), '{"template":true}');
  await writeFile(join(root, 'src', 'settings.template.json'), '{"settings":true}');
  await writeFile(
    join(root, 'src', 'agents', 'swarm-worker.template.md'),
    '---\nname: {{NAME}}\ndescription: {{DESCRIPTION}}\nskills:\n{{SKILLS}}\n---\n\n{{ROLE_LINE}}\n'
  );
  for (const name of ['conventions', 'decisions', 'landmarks', 'landmines', 'libraries', 'pending-questions']) {
    await writeFile(join(root, 'src', 'memory', `${name}.template.md`), `# ${name}`);
  }

  return root;
}

function runBuild(fixtureRoot, env = {}) {
  // Strip GITHUB_RUN_ID from the inherited process env unless the caller
  // explicitly sets it — running these tests inside a real GitHub Actions
  // run would otherwise smuggle the runner's id into the "unset" test.
  const baseEnv = { ...process.env };
  delete baseEnv.GITHUB_RUN_ID;
  execFileSync('bash', [BUILD_SCRIPT], {
    cwd: fixtureRoot,
    env: { ...baseEnv, PKG_ROOT: fixtureRoot, PATH: process.env.PATH, ...env },
    stdio: 'pipe',
  });
}

async function readManifest(fixtureRoot) {
  const manifestPath = join(fixtureRoot, 'obj', 'template', 'manifest.json');
  assert.ok(existsSync(manifestPath), `manifest.json missing at ${manifestPath}`);
  return JSON.parse(await readFile(manifestPath, 'utf8'));
}

describe('build-template.sh — manifest.json build_id stamping (AC-009)', () => {
  it('test_when_build_template_runs_with_github_run_id_set_then_manifest_contains_build_id_gha_prefix', async () => {
    const root = await makeFixture();
    runBuild(root, { GITHUB_RUN_ID: '12345' });
    const manifest = await readManifest(root);
    assert.equal(
      manifest.build_id,
      'gha-12345',
      `manifest.build_id must be "gha-${'12345'}" when GITHUB_RUN_ID is set; got: ${manifest.build_id}`
    );
  });

  it('test_when_build_template_runs_without_github_run_id_then_manifest_has_no_build_id_key', async () => {
    const root = await makeFixture();
    runBuild(root); // No GITHUB_RUN_ID in env.
    const manifest = await readManifest(root);
    assert.equal(
      Object.prototype.hasOwnProperty.call(manifest, 'build_id'),
      false,
      `manifest.json must have NO build_id key when GITHUB_RUN_ID is unset (byte-identical dev manifest invariant); got keys: ${Object.keys(manifest).join(', ')}`
    );
  });
});
