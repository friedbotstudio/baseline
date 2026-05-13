import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, cp, rm, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const ROOT = dirname(fileURLToPath(new URL('../package.json', import.meta.url)));
const BUILD_SCRIPT = join(ROOT, 'scripts', 'build-template.sh');

/**
 * Build-pipeline gate: the build SHALL run audit-baseline before producing
 * `template/`, and SHALL fail-fast if any audit invariant is violated. Without
 * this gate, a polluted `src/` template (e.g., seed §16 stamped, swarm-worker
 * placeholder dropped, project.json `configured: true`) would silently reach
 * npm — the test suite catches that only if someone happens to run `npm test`
 * between editing `src/` and `npm pack`.
 */

async function makeIsolatedRepoCopy() {
  const root = await mkdtemp(join(tmpdir(), 'build-audit-gate-'));
  // Directory subtrees the audit + build need.
  for (const entry of ['.claude', 'src', 'scripts', 'docs']) {
    const from = join(ROOT, entry);
    if (existsSync(from)) await cp(from, join(root, entry), { recursive: true });
  }
  // Top-level files the audit reads.
  for (const entry of ['.mcp.json', 'CLAUDE.md', 'README.md']) {
    const from = join(ROOT, entry);
    if (existsSync(from)) await cp(from, join(root, entry));
  }
  return root;
}

function runBuild(repoRoot) {
  return spawnSync('bash', [BUILD_SCRIPT], {
    cwd: repoRoot,
    env: { ...process.env, PKG_ROOT: repoRoot },
    encoding: 'utf8',
  });
}

describe('build pipeline gates on audit-baseline', () => {
  let isolatedRoot;

  before(async () => {
    isolatedRoot = await makeIsolatedRepoCopy();
  });

  after(async () => {
    if (isolatedRoot) await rm(isolatedRoot, { recursive: true, force: true });
  });

  it('passes audit and builds successfully on the canonical src/', () => {
    const result = runBuild(isolatedRoot);
    assert.equal(result.status, 0, `expected exit 0, got ${result.status}.\nstderr: ${result.stderr}\nstdout: ${result.stdout}`);
    assert.ok(existsSync(join(isolatedRoot, 'obj', 'template', '.claude', 'project.json')),
      'build should have produced template/.claude/project.json');
  });

  it('aborts when src/seed.template.md §16 is polluted with a real Generated: stamp', async () => {
    const seedPath = join(isolatedRoot, 'src', 'seed.template.md');
    const original = await readFile(seedPath, 'utf8');
    // Replace the pristine §16 reservation with a populated stamp shape.
    const polluted = original.replace(
      /## §16 — Project-specific configuration[^\n]*/,
      '## §16 — Project-specific configuration\n\nGenerated: 2026-01-01T00:00:00Z\nBy: /init-project (run #1)'
    );
    assert.notEqual(polluted, original, 'pollution edit must change the file');
    await writeFile(seedPath, polluted);

    try {
      const result = runBuild(isolatedRoot);
      assert.notEqual(result.status, 0, 'build must abort on polluted seed.template.md');
      const combined = result.stderr + result.stdout;
      assert.match(combined, /audit/i, 'build failure output should mention the audit');
      assert.match(combined, /seed\.template\.md/, 'build failure output should name the polluted file');
    } finally {
      await writeFile(seedPath, original);
    }
  });

  it('aborts when src/agents/swarm-worker.template.md drops the placeholder tokens', async () => {
    const workerPath = join(isolatedRoot, 'src', 'agents', 'swarm-worker.template.md');
    const original = await readFile(workerPath, 'utf8');
    const flattened = original
      .replace('{{NAME}}', 'swarm-worker')
      .replace('{{DESCRIPTION}}', 'baseline description')
      .replace('{{SKILLS}}', '  - scenario\n  - implement')
      .replace('{{ROLE_LINE}}', 'You are a swarm worker.');
    assert.notEqual(flattened, original, 'flattening edit must change the file');
    await writeFile(workerPath, flattened);

    try {
      const result = runBuild(isolatedRoot);
      assert.notEqual(result.status, 0, 'build must abort on flattened swarm-worker template');
      const combined = result.stderr + result.stdout;
      assert.match(combined, /audit/i, 'build failure output should mention the audit');
      assert.match(combined, /swarm-worker/, 'build failure output should name the affected file');
    } finally {
      await writeFile(workerPath, original);
    }
  });

  it('aborts when src/project.template.json has configured=true', async () => {
    const projectPath = join(isolatedRoot, 'src', 'project.template.json');
    const original = await readFile(projectPath, 'utf8');
    const polluted = original.replace('"configured": false', '"configured": true');
    assert.notEqual(polluted, original, 'pollution edit must change the file');
    await writeFile(projectPath, polluted);

    try {
      const result = runBuild(isolatedRoot);
      assert.notEqual(result.status, 0, 'build must abort on project.template.json with configured=true');
    } finally {
      await writeFile(projectPath, original);
    }
  });
});
