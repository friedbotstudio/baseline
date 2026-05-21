import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, mkdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

// Absolute path to the build script in the real project root.
// Tests invoke it with PKG_ROOT overridden to the temp fixture dir.
const BUILD_SCRIPT = new URL('../scripts/build-template.sh', import.meta.url).pathname;
const BUILD_MANIFEST = new URL('../scripts/build-manifest.mjs', import.meta.url).pathname;

/** Create a minimal fixture directory that looks like the project root. */
async function makeFixture() {
  const root = await mkdtemp(join(tmpdir(), 'build-template-test-'));

  // Mandatory live files that rsync copies verbatim (later overwritten by overlays).
  await writeFile(join(root, 'CLAUDE.md'), 'LIVE CLAUDE CONTENT');
  await writeFile(join(root, '.mcp.json'), '{}');
  await mkdir(join(root, 'docs', 'init'), { recursive: true });
  await writeFile(join(root, 'docs', 'init', 'seed.md'), 'LIVE SEED CONTENT');

  // .claude/ skeleton.
  await mkdir(join(root, '.claude'), { recursive: true });
  await writeFile(join(root, '.claude', 'project.json'), '{"configured":false}');
  await writeFile(join(root, '.claude', 'settings.json'), '{}');

  // src/*.template.* overlays (these are the canonical source for template/).
  await mkdir(join(root, 'src', 'agents'), { recursive: true });
  await mkdir(join(root, 'src', 'memory'), { recursive: true });
  await mkdir(join(root, 'src', '.claude'), { recursive: true });
  await writeFile(join(root, 'src', 'CLAUDE.template.md'), 'TEMPLATE CLAUDE CONTENT');
  await writeFile(join(root, 'src', 'seed.template.md'), 'TEMPLATE SEED CONTENT');
  await writeFile(join(root, 'src', 'project.template.json'), '{"configured":false,"template":true}');
  await writeFile(join(root, 'src', '.mcp.template.json'), '{"template":true}');
  await writeFile(join(root, 'src', 'settings.template.json'), '{"settings":true}');
  // workflows.template.jsonl is overlaid by build-template.sh Stage 2 (§18).
  // Test fixture uses a minimal one-track stub so the cp succeeds and the
  // manifest emitter sees the file; content is opaque to the build step.
  await writeFile(
    join(root, 'src', '.claude', 'workflows.template.jsonl'),
    '{"$schema":"./schemas/workflow-track.v1.json","track_id":"stub","name":"stub","description":"fixture","selectable":true,"selector_hints":[],"preconditions":[],"invariants":["commits"],"nodes":[{"id":"chore","type":"task","skill":"chore","depends_on":[],"blocks":[],"can_parallel":false,"needs_user":false,"activeForm":"Stub","metadata":{"phase":"chore"}}]}\n'
  );
  // Template must carry all four substitution tokens — scripts/render-swarm-worker.mjs
  // exits non-zero if any are missing (audit-baseline enforces the same on the real template).
  await writeFile(
    join(root, 'src', 'agents', 'swarm-worker.template.md'),
    '---\nname: {{NAME}}\ndescription: {{DESCRIPTION}}\nskills:\n{{SKILLS}}\n---\n\n{{ROLE_LINE}}\n'
  );
  const memoryFiles = [
    'conventions', 'decisions', 'landmarks', 'landmines', 'libraries', 'pending-questions',
  ];
  for (const name of memoryFiles) {
    await writeFile(join(root, 'src', 'memory', `${name}.template.md`), `# ${name}`);
  }

  return root;
}

/** Sha256 hex of file contents. */
async function sha256File(filePath) {
  const buf = await readFile(filePath);
  return createHash('sha256').update(buf).digest('hex');
}

/** Run build-template.sh with PKG_ROOT pointing at the given fixture dir. */
function runBuild(fixtureRoot) {
  execFileSync('bash', [BUILD_SCRIPT], {
    cwd: fixtureRoot,
    env: {
      ...process.env,
      PKG_ROOT: fixtureRoot,
      // Ensure node can be found for the manifest step.
      PATH: process.env.PATH,
    },
    stdio: 'pipe',
  });
}

describe('build-template.sh', () => {
  it('build creates template/ directory with the expected sentinel files', async () => {
    const root = await makeFixture();
    runBuild(root);

    assert.ok(existsSync(join(root, 'obj', 'template', 'CLAUDE.md')), 'template/CLAUDE.md missing');
    assert.ok(existsSync(join(root, 'obj', 'template', '.mcp.json')), 'template/.mcp.json missing');
    assert.ok(existsSync(join(root, 'obj', 'template', 'docs', 'init', 'seed.md')), 'template/docs/init/seed.md missing');
    assert.ok(existsSync(join(root, 'obj', 'template', '.claude', 'project.json')), 'template/.claude/project.json missing');
    assert.ok(existsSync(join(root, 'obj', 'template', '.claude', 'settings.json')), 'template/.claude/settings.json missing');
    assert.ok(existsSync(join(root, 'obj', 'template', '.claude', 'manifest.json')), 'template/.claude/manifest.json missing');
  });

  it('build excludes documented paths', async () => {
    const root = await makeFixture();
    // Plant directories that must NOT appear in template/.
    await mkdir(join(root, '.claude', 'state'), { recursive: true });
    await writeFile(join(root, '.claude', 'state', 'workflow.json'), '{}');
    await mkdir(join(root, 'docs', 'intake'), { recursive: true });
    await writeFile(join(root, 'docs', 'intake', 'test.md'), 'intake doc');
    await mkdir(join(root, 'node_modules', 'foo'), { recursive: true });
    await writeFile(join(root, 'node_modules', 'foo', 'index.js'), 'module');

    runBuild(root);

    assert.ok(!existsSync(join(root, 'obj', 'template', '.claude', 'state')), 'template/.claude/state/ must be excluded');
    assert.ok(!existsSync(join(root, 'obj', 'template', 'src')), 'template/src/ must be excluded');
    assert.ok(!existsSync(join(root, 'obj', 'template', 'docs', 'intake')), 'template/docs/intake/ must be excluded');
    assert.ok(!existsSync(join(root, 'obj', 'template', 'node_modules')), 'template/node_modules/ must be excluded');
  });

  it('build overlays src/*.template.* onto canonical paths', async () => {
    const root = await makeFixture();
    // Marker content written above: src/CLAUDE.template.md = 'TEMPLATE CLAUDE CONTENT'
    // Live file: CLAUDE.md = 'LIVE CLAUDE CONTENT' — overlay must win.
    runBuild(root);

    const templateClaude = await readFile(join(root, 'obj', 'template', 'CLAUDE.md'), 'utf8');
    assert.equal(templateClaude, 'TEMPLATE CLAUDE CONTENT',
      'template/CLAUDE.md must contain overlay source content, not the live file content');

    const templateProject = await readFile(join(root, 'obj', 'template', '.claude', 'project.json'), 'utf8');
    const srcProject = await readFile(join(root, 'src', 'project.template.json'), 'utf8');
    assert.equal(templateProject, srcProject,
      'template/.claude/project.json must byte-equal src/project.template.json');
  });

  it('build writes manifest.json with sha256 entries reflecting post-overlay state', async () => {
    const root = await makeFixture();
    runBuild(root);

    const manifestRaw = await readFile(join(root, 'obj', 'template', '.claude', 'manifest.json'), 'utf8');
    const manifest = JSON.parse(manifestRaw);

    assert.equal(manifest.manifest_version, 3, 'manifest_version must be 3 (post tier-classified upgrade rework)');
    assert.ok(typeof manifest.files === 'object' && manifest.files !== null, 'manifest.files must be an object');
    assert.ok(Object.prototype.hasOwnProperty.call(manifest.files, 'CLAUDE.md'),
      "manifest.files must contain 'CLAUDE.md'");

    // The sha256 entry must match the actual file on disk (post-overlay).
    // Manifest v3 stores entries as `{sha256, tier}` objects per file; v2
    // stored bare sha256 strings. Read whichever shape is present.
    const readSha = (entry) =>
      (entry && typeof entry === 'object' && typeof entry.sha256 === 'string')
        ? entry.sha256
        : entry;
    const actualHash = await sha256File(join(root, 'obj', 'template', 'CLAUDE.md'));
    assert.equal(readSha(manifest.files['CLAUDE.md']), actualHash,
      "manifest.files['CLAUDE.md'].sha256 must equal sha256 of template/CLAUDE.md");

    // That file was overlaid from src/CLAUDE.template.md, so hashes must agree.
    const srcHash = await sha256File(join(root, 'src', 'CLAUDE.template.md'));
    assert.equal(readSha(manifest.files['CLAUDE.md']), srcHash,
      "manifest.files['CLAUDE.md'].sha256 must equal sha256 of src/CLAUDE.template.md (overlay source)");
  });

  it('build is idempotent — two runs produce identical hashes', async () => {
    const root = await makeFixture();
    runBuild(root);

    // Collect sha256 of every file under template/ after first run (excluding
    // .claude/manifest.json which contains generated_at and is expected to differ).
    async function collectHashes(templateDir) {
      const hashes = {};
      async function walk(dir) {
        const { readdir, stat } = await import('node:fs/promises');
        const entries = await readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
          const full = join(dir, entry.name);
          if (entry.isDirectory()) {
            await walk(full);
          } else if (entry.isFile()) {
            const rel = full.slice(templateDir.length + 1);
            if (rel === '.claude/manifest.json') continue;
            hashes[rel] = await sha256File(full);
          }
        }
      }
      await walk(templateDir);
      return hashes;
    }

    const firstHashes = await collectHashes(join(root, 'obj', 'template'));

    runBuild(root);
    const secondHashes = await collectHashes(join(root, 'obj', 'template'));

    assert.deepEqual(firstHashes, secondHashes,
      'All non-manifest files must have identical sha256 hashes across two consecutive builds');
  });
});
