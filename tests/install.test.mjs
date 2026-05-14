import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const install = await import('../src/cli/install.js');

async function makeTemplateFixture() {
  const tplDir = await mkdtemp(join(tmpdir(), 'install-tpl-'));
  await mkdir(join(tplDir, '.claude'));
  await writeFile(join(tplDir, 'CLAUDE.md'), '# baseline\n');
  await writeFile(join(tplDir, '.mcp.json'), JSON.stringify({
    mcpServers: { context7: { command: 'npx', args: ['-y', '@upstash/context7-mcp'] } },
  }, null, 2) + '\n');
  await writeFile(join(tplDir, '.claude/project.json'), JSON.stringify({ configured: false }, null, 2) + '\n');
  await mkdir(join(tplDir, 'docs'));
  await mkdir(join(tplDir, 'docs/init'));
  await writeFile(join(tplDir, 'docs/init/seed.md'), '# seed\n');
  return tplDir;
}

describe('freshInstall', () => {
  it('writes the full template tree to an empty target', async () => {
    const tpl = await makeTemplateFixture();
    const target = await mkdtemp(join(tmpdir(), 'install-target-'));

    await install.freshInstall(tpl, target);

    await access(join(target, 'CLAUDE.md'));
    await access(join(target, '.mcp.json'));
    await access(join(target, '.claude/project.json'));
    await access(join(target, 'docs/init/seed.md'));
  });

  it('writes a baseline manifest to .claude/.baseline-manifest.json', async () => {
    const tpl = await makeTemplateFixture();
    const target = await mkdtemp(join(tmpdir(), 'install-target-'));

    await install.freshInstall(tpl, target);

    const manifestText = await readFile(join(target, '.claude/.baseline-manifest.json'), 'utf8');
    const m = JSON.parse(manifestText);
    assert.equal(m.manifest_version, 1);
    assert.ok(typeof m.generated_at === 'string');
    assert.ok(m.files && typeof m.files === 'object');
    assert.ok(Object.keys(m.files).length > 0);
  });
});

describe('freshInstall — supply-chain-hardening (AC-007, opt-in via --with-npmrc)', () => {
  it('test_when_install_runs_with_with_npmrc_flag_then_target_npmrc_exists_with_template_contents', async () => {
    const NPMRC_BYTES = 'ignore-scripts=true\nmin-release-age=7\n';
    const tpl = await makeTemplateFixture();
    const target = await mkdtemp(join(tmpdir(), 'install-npmrc-target-'));

    await install.freshInstall(tpl, target, { withNpmrc: true });

    const observed = await readFile(join(target, '.npmrc'), 'utf8');
    assert.equal(
      observed,
      NPMRC_BYTES,
      `target/.npmrc must equal exactly "ignore-scripts=true\\nmin-release-age=7\\n" (no BOM, no extras); got: ${JSON.stringify(observed)}`
    );
  });

  it('test_when_npmrc_template_exists_in_dev_repo_then_its_bytes_match_spec', async () => {
    // The pristine template at src/.npmrc.template is the canonical source overlaid into
    // obj/template/.npmrc by scripts/build-template.sh. Its bytes are the spec.
    const NPMRC_BYTES = 'ignore-scripts=true\nmin-release-age=7\n';
    const { fileURLToPath } = await import('node:url');
    const path = await import('node:path');
    const here = path.dirname(fileURLToPath(import.meta.url));
    const repoRoot = path.resolve(here, '..');
    const tplPath = path.join(repoRoot, 'src/.npmrc.template');
    const observed = await readFile(tplPath, 'utf8');
    assert.equal(
      observed,
      NPMRC_BYTES,
      `src/.npmrc.template must equal exactly "ignore-scripts=true\\nmin-release-age=7\\n"; got: ${JSON.stringify(observed)}`
    );
  });
});

describe('forceInstall', () => {
  it('overwrites existing files', async () => {
    const tpl = await makeTemplateFixture();
    const target = await mkdtemp(join(tmpdir(), 'install-target-'));

    await writeFile(join(target, 'CLAUDE.md'), 'STALE\n');

    await install.forceInstall(tpl, target);

    const after = await readFile(join(target, 'CLAUDE.md'), 'utf8');
    assert.equal(after, '# baseline\n');
  });

  it('preserves an existing .claude/project.json (NEVER_TOUCH)', async () => {
    const tpl = await makeTemplateFixture();
    const target = await mkdtemp(join(tmpdir(), 'install-target-'));

    await mkdir(join(target, '.claude'));
    const userProject = JSON.stringify({ configured: true, marker: 'user-state' }, null, 2) + '\n';
    await writeFile(join(target, '.claude/project.json'), userProject);

    await install.forceInstall(tpl, target);

    const after = await readFile(join(target, '.claude/project.json'), 'utf8');
    assert.equal(after, userProject);
  });

  it('additive-merges .mcp.json (SPECIAL_MERGE) preserving user keys', async () => {
    const tpl = await makeTemplateFixture();
    const target = await mkdtemp(join(tmpdir(), 'install-target-'));

    const userMcp = {
      mcpServers: {
        linear: { command: 'npx', args: ['-y', 'linear-mcp'] },
      },
    };
    await writeFile(join(target, '.mcp.json'), JSON.stringify(userMcp, null, 2) + '\n');

    await install.forceInstall(tpl, target);

    const after = JSON.parse(await readFile(join(target, '.mcp.json'), 'utf8'));
    assert.ok('linear' in after.mcpServers, 'user-only linear server preserved');
    assert.ok('context7' in after.mcpServers, 'baseline context7 added');
  });
});

// `obj/template/manifest.json` exists at the root of the shipped template tree
// (it's a sha256 table consumed by `--merge` to detect drift). The recursive cp
// in fresh/forceInstall previously copied it to `target/manifest.json`, leaving
// a stray reference manifest at the consumer's project root. The materialized
// manifest the CLI itself writes lives at `target/.claude/.baseline-manifest.json`
// — that one is the only manifest the CLI runtime reads. The shipped manifest
// stays in the published tarball for ship-time provenance inspection but must
// not land in target.
describe('install — manifest.json must not land at target root', () => {
  async function fixtureWithManifest() {
    const tpl = await makeTemplateFixture();
    await writeFile(
      join(tpl, 'manifest.json'),
      JSON.stringify({ manifest_version: 1, files: {} }, null, 2) + '\n'
    );
    return tpl;
  }

  it('test_when_fresh_install_completes_then_target_manifest_json_does_not_exist', async () => {
    const tpl = await fixtureWithManifest();
    const target = await mkdtemp(join(tmpdir(), 'install-mfst-target-'));

    await install.freshInstall(tpl, target);

    await assert.rejects(
      access(join(target, 'manifest.json')),
      { code: 'ENOENT' },
      'target/manifest.json must NOT exist after freshInstall (the shipped reference manifest is for inspection, not for materialization)'
    );
    await access(join(target, '.claude/.baseline-manifest.json'));
  });

  it('test_when_force_install_completes_then_target_manifest_json_does_not_exist', async () => {
    const tpl = await fixtureWithManifest();
    const target = await mkdtemp(join(tmpdir(), 'install-mfst-target-'));
    await writeFile(join(target, 'CLAUDE.md'), 'STALE\n');

    await install.forceInstall(tpl, target);

    await assert.rejects(
      access(join(target, 'manifest.json')),
      { code: 'ENOENT' },
      'target/manifest.json must NOT exist after forceInstall (same exclusion as fresh path)'
    );
  });
});

// `.npmrc` is no longer created unconditionally. Default install leaves the
// target without a `.npmrc`. Operators who want the hardened npm posture
// (ignore-scripts=true, min-release-age=7) opt in via the CLI flag
// `--with-npmrc`, which the install functions receive as `opts.withNpmrc`.
describe('install — .npmrc opt-in via opts.withNpmrc', () => {
  it('test_when_fresh_install_completes_without_flag_then_target_npmrc_does_not_exist', async () => {
    const tpl = await makeTemplateFixture();
    const target = await mkdtemp(join(tmpdir(), 'install-npmrc-default-'));

    await install.freshInstall(tpl, target);

    await assert.rejects(
      access(join(target, '.npmrc')),
      { code: 'ENOENT' },
      'default freshInstall (no withNpmrc opt) must NOT create target/.npmrc'
    );
  });

  it('test_when_force_install_completes_without_flag_then_target_npmrc_does_not_exist', async () => {
    const tpl = await makeTemplateFixture();
    const target = await mkdtemp(join(tmpdir(), 'install-npmrc-default-'));

    await install.forceInstall(tpl, target);

    await assert.rejects(
      access(join(target, '.npmrc')),
      { code: 'ENOENT' },
      'default forceInstall (no withNpmrc opt) must NOT create target/.npmrc'
    );
  });

  it('test_when_install_runs_with_with_npmrc_flag_and_target_already_has_npmrc_then_existing_npmrc_preserved', async () => {
    const SENTINEL = 'registry=https://example.com/\n';
    const tpl = await makeTemplateFixture();
    const target = await mkdtemp(join(tmpdir(), 'install-npmrc-existing-'));
    await writeFile(join(target, '.npmrc'), SENTINEL);

    await install.freshInstall(tpl, target, { withNpmrc: true });

    const observed = await readFile(join(target, '.npmrc'), 'utf8');
    assert.equal(
      observed,
      SENTINEL,
      'existing target/.npmrc must be preserved verbatim when --with-npmrc is set (the materialize step has a "do not clobber" guard)'
    );
  });
});
