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
  // The shipped manifest moved into the .claude/ subtree per CLAUDE.md
  // Article XI (commit e2927c7); read it from the new location.
  const manifestPath = join(fixtureRoot, 'obj', 'template', '.claude', 'manifest.json');
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

// Shipped manifest tier classification (upgrade-flow-rework AC-013).
// build-manifest.mjs writes a per-file {sha256, tier} object map at
// `.claude/manifest.json` inside the template dir it's invoked against.
// These tests call build-manifest.mjs directly on a synthetic template dir
// (the full build-template.sh pipeline does not copy a README.md so wouldn't
// exercise the README→MECHANICAL classification path).

const MANIFEST_SCRIPT = new URL('../scripts/build-manifest.mjs', import.meta.url).pathname;

async function makeTierTemplateDir() {
  const root = await mkdtemp(join(tmpdir(), 'tier-fixture-'));
  // SEMANTIC_EXPLICIT entries
  await mkdir(join(root, 'docs', 'init'), { recursive: true });
  await writeFile(join(root, 'docs', 'init', 'seed.md'), '# seed\n');
  await writeFile(join(root, 'CLAUDE.md'), '# CLAUDE\n');
  await mkdir(join(root, 'src'), { recursive: true });
  await writeFile(join(root, 'src', 'seed.template.md'), '# seed template\n');
  await writeFile(join(root, 'src', 'CLAUDE.template.md'), '# CLAUDE template\n');
  // README.md (must be MECHANICAL, not SEMANTIC)
  await writeFile(join(root, 'README.md'), '# README\n');
  // .sh hook (MECHANICAL by extension)
  await mkdir(join(root, '.claude', 'hooks'), { recursive: true });
  await writeFile(join(root, '.claude', 'hooks', 'foo.sh'), '#!/usr/bin/env bash\necho hi\n');
  // SKILL.md (MECHANICAL by default)
  await mkdir(join(root, '.claude', 'skills', 'sample'), { recursive: true });
  await writeFile(join(root, '.claude', 'skills', 'sample', 'SKILL.md'),
    '---\nname: sample\nowner: baseline\ndescription: sample skill\n---\n\nbody\n');
  // Frontmatter override (.md with tier: BINARY_PROMPT)
  await mkdir(join(root, '.claude', 'commands'), { recursive: true });
  await writeFile(join(root, '.claude', 'commands', 'override.md'),
    '---\nname: override\nowner: baseline\ndescription: x\ntier: BINARY_PROMPT\n---\n\nbody\n');
  // NEVER_TOUCH allowlist
  await writeFile(join(root, '.claude', 'project.json'), '{"configured":false}');
  // SPECIAL_MERGE allowlist
  await writeFile(join(root, '.mcp.json'), '{}');
  return root;
}

function runBuildManifest(tplDir) {
  execFileSync('node', [MANIFEST_SCRIPT, tplDir], { stdio: 'pipe', encoding: 'utf8' });
}

async function readTierManifest(tplDir) {
  const p = join(tplDir, '.claude', 'manifest.json');
  assert.ok(existsSync(p), `shipped manifest missing at ${p}`);
  return JSON.parse(await readFile(p, 'utf8'));
}

describe('build-manifest.mjs — shipped manifest tier classification (AC-013)', () => {
  it('test_when_build_manifest_then_shipped_manifest_version_is_3', async () => {
    const tpl = await makeTierTemplateDir();
    runBuildManifest(tpl);
    const m = await readTierManifest(tpl);
    assert.equal(m.manifest_version, 3,
      `shipped manifest must be manifest_version: 3 after rework; got ${m.manifest_version}`);
  });

  it('test_when_build_manifest_then_every_files_entry_is_object_with_sha256_and_tier', async () => {
    const tpl = await makeTierTemplateDir();
    runBuildManifest(tpl);
    const m = await readTierManifest(tpl);
    for (const [rel, entry] of Object.entries(m.files)) {
      assert.ok(entry && typeof entry === 'object',
        `files[${rel}] must be an object (post-rework); got ${typeof entry}`);
      assert.ok(typeof entry.sha256 === 'string' && /^[0-9a-f]{64}$/.test(entry.sha256),
        `files[${rel}].sha256 must be a 64-char hex string; got ${entry.sha256}`);
      assert.ok(typeof entry.tier === 'string',
        `files[${rel}].tier must be a string; got ${entry.tier}`);
    }
  });

  it('test_when_seed_md_in_template_then_tier_is_semantic', async () => {
    const tpl = await makeTierTemplateDir();
    runBuildManifest(tpl);
    const m = await readTierManifest(tpl);
    assert.equal(m.files['docs/init/seed.md']?.tier, 'SEMANTIC',
      'docs/init/seed.md is in SEMANTIC_EXPLICIT — tier must be SEMANTIC');
  });

  it('test_when_claude_md_in_template_then_tier_is_semantic', async () => {
    const tpl = await makeTierTemplateDir();
    runBuildManifest(tpl);
    const m = await readTierManifest(tpl);
    assert.equal(m.files['CLAUDE.md']?.tier, 'SEMANTIC',
      'CLAUDE.md is in SEMANTIC_EXPLICIT — tier must be SEMANTIC');
  });

  it('test_when_readme_md_in_template_then_tier_is_mechanical_not_semantic', async () => {
    const tpl = await makeTierTemplateDir();
    runBuildManifest(tpl);
    const m = await readTierManifest(tpl);
    assert.equal(m.files['README.md']?.tier, 'MECHANICAL',
      'README.md is EXPLICITLY NOT in SEMANTIC_EXPLICIT per user direction — tier must default to MECHANICAL, not SEMANTIC');
  });

  it('test_when_skill_md_in_template_then_tier_is_mechanical_default', async () => {
    const tpl = await makeTierTemplateDir();
    runBuildManifest(tpl);
    const m = await readTierManifest(tpl);
    assert.equal(m.files['.claude/skills/sample/SKILL.md']?.tier, 'MECHANICAL',
      'SKILL.md files default to MECHANICAL — only SEMANTIC_EXPLICIT four files are SEMANTIC');
  });

  it('test_when_md_file_frontmatter_has_tier_override_then_tier_uses_override', async () => {
    const tpl = await makeTierTemplateDir();
    runBuildManifest(tpl);
    const m = await readTierManifest(tpl);
    assert.equal(m.files['.claude/commands/override.md']?.tier, 'BINARY_PROMPT',
      'frontmatter tier: BINARY_PROMPT must override the .md default of MECHANICAL');
  });

  it('test_when_sh_file_in_template_then_tier_is_mechanical', async () => {
    const tpl = await makeTierTemplateDir();
    runBuildManifest(tpl);
    const m = await readTierManifest(tpl);
    assert.equal(m.files['.claude/hooks/foo.sh']?.tier, 'MECHANICAL',
      '.sh files default to MECHANICAL');
  });

  it('test_when_project_json_in_template_then_tier_is_NEVER_TOUCH', async () => {
    const tpl = await makeTierTemplateDir();
    runBuildManifest(tpl);
    const m = await readTierManifest(tpl);
    assert.equal(m.files['.claude/project.json']?.tier, 'NEVER_TOUCH',
      '.claude/project.json is in the NEVER_TOUCH allowlist — tier must be NEVER_TOUCH');
  });
});
