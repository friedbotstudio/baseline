// Tests for scripts/bundle-mcp-servers.mjs — the build-time esbuild bundling of
// the first-party MCP servers (sprint-channel, sprint-pool) into self-contained
// single-file artifacts. Spec: docs/specs/bundle-mcp-servers-esbuild.md.
//
// RED-before-green: scripts/bundle-mcp-servers.mjs does not exist yet, so the
// top-level dynamic import fails and every test that needs it asserts the module
// loaded first (single clear failure per test rather than a cryptic collect
// error). AC-005/AC-006 read real repo files and don't need the module.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, cp, writeFile, readFile, rm, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..');
const MCP_DIRS = ['sprint-channel', 'sprint-pool', 'sprint-broker'];
const BUNDLED_TARGETS = ['sprint-channel', 'sprint-pool'];

// Attempt to load the not-yet-written source. Stash the error so each test can
// fail RED with a descriptive message instead of the whole file erroring.
let mod = null;
let importError = null;
try {
  mod = await import(pathToFileURL(path.join(REPO_ROOT, 'scripts', 'bundle-mcp-servers.mjs')).href);
} catch (e) {
  importError = e;
}

function requireModule() {
  assert.ok(mod, `scripts/bundle-mcp-servers.mjs must exist and load (import error: ${importError && importError.message})`);
  return mod;
}

// Seed a temp template dir mirroring obj/template's .claude/mcp/ layout by copying
// the real first-party server sources (channel + pool + the broker the pool imports).
async function seedTemplate() {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'bundle-tmpl-'));
  const mcpDest = path.join(dir, '.claude', 'mcp');
  await mkdir(mcpDest, { recursive: true });
  for (const d of MCP_DIRS) {
    await cp(path.join(REPO_ROOT, '.claude', 'mcp', d), path.join(mcpDest, d), { recursive: true });
  }
  return dir;
}

// Extract every static import specifier from ESM source text.
function importSpecifiers(src) {
  const specs = [];
  const re = /(?:^|\n)\s*(?:import\b[^'"]*?from\s*|import\s*)['"]([^'"]+)['"]/g;
  let m;
  while ((m = re.exec(src)) !== null) specs.push(m[1]);
  // dynamic import(...) with a string literal
  const dyn = /import\(\s*['"]([^'"]+)['"]\s*\)/g;
  while ((m = dyn.exec(src)) !== null) specs.push(m[1]);
  return specs;
}

function nonBuiltinSpecifiers(src) {
  return importSpecifiers(src).filter((s) => !s.startsWith('node:'));
}

describe('bundle-mcp-servers', () => {
  it('test_when_bundle_helper_runs_then_each_target_self_contained_bundle_written', { timeout: 120000 }, async () => {
    // Covers AC-001.
    const m = requireModule();
    const dir = await seedTemplate();
    try {
      await m.bundleServers(dir);
      for (const server of BUNDLED_TARGETS) {
        const out = path.join(dir, '.claude', 'mcp', server, 'server.mjs');
        assert.ok(existsSync(out), `bundle written for ${server}`);
        const src = await readFile(out, 'utf8');
        assert.ok(src.length > 0, `${server} bundle non-empty`);
      }
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('test_when_bundle_imports_scanned_then_only_node_builtins', { timeout: 120000 }, async () => {
    // Covers AC-002.
    const m = requireModule();
    const dir = await seedTemplate();
    try {
      await m.bundleServers(dir);
      for (const server of BUNDLED_TARGETS) {
        const src = await readFile(path.join(dir, '.claude', 'mcp', server, 'server.mjs'), 'utf8');
        const offenders = nonBuiltinSpecifiers(src);
        assert.deepEqual(offenders, [], `${server} bundle must import only node: builtins, found: ${offenders.join(', ')}`);
      }
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('test_when_bundle_run_with_prod_deps_only_then_module_graph_resolves', { timeout: 120000 }, async () => {
    // Covers AC-003.
    const m = requireModule();
    const dir = await seedTemplate();
    // sandbox: a dir with NO node_modules on the resolution path
    const sandbox = await mkdtemp(path.join(os.tmpdir(), 'bundle-sandbox-'));
    try {
      await m.bundleServers(dir);
      const bundle = path.join(dir, '.claude', 'mcp', 'sprint-channel', 'server.mjs');
      const bundleUrl = pathToFileURL(bundle).href;
      // Importing (not running as main) exercises the whole module graph without
      // starting the stdio transport (server.mjs guards on import.meta.url === argv[1]).
      // If the SDK/zod were NOT inlined this throws ERR_MODULE_NOT_FOUND.
      const res = execFileSync(process.execPath,
        ['--input-type=module', '-e', `await import(${JSON.stringify(bundleUrl)}); console.log('RESOLVED');`],
        { cwd: sandbox, encoding: 'utf8', env: { ...process.env, NODE_PATH: '' } });
      assert.match(res, /RESOLVED/, 'bundled module graph resolves with no external deps');
    } finally {
      await rm(dir, { recursive: true, force: true });
      await rm(sandbox, { recursive: true, force: true });
    }
  });

  it('test_when_non_self_contained_module_scanned_then_scan_reports_failure', async () => {
    // Covers AC-002.
    const m = requireModule();
    const bad = [
      "import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';",
      "import { z } from 'zod';",
      "import { readFileSync } from 'node:fs';",
    ].join('\n');
    const verdict = m.isSelfContained(bad);
    assert.equal(verdict.ok, false, 'scanner must flag a module with bare package imports');
    assert.ok(Array.isArray(verdict.offenders) && verdict.offenders.length >= 2,
      `offenders should list the bare specifiers, got: ${JSON.stringify(verdict.offenders)}`);
    assert.ok(verdict.offenders.includes('@modelcontextprotocol/sdk/server/mcp.js'));
    assert.ok(verdict.offenders.includes('zod'));
  });

  it('test_when_manifest_built_after_bundle_then_bundle_is_hashed', { timeout: 120000 }, async () => {
    // Covers AC-004.
    const m = requireModule();
    const dir = await seedTemplate();
    try {
      await m.bundleServers(dir);
      execFileSync(process.execPath, [path.join(REPO_ROOT, 'scripts', 'build-manifest.mjs'), dir],
        { encoding: 'utf8' });
      const manifest = JSON.parse(await readFile(path.join(dir, '.claude', 'manifest.json'), 'utf8'));
      for (const server of BUNDLED_TARGETS) {
        const rel = `.claude/mcp/${server}/server.mjs`;
        assert.ok(manifest.files[rel], `manifest must include ${rel}`);
        assert.match(manifest.files[rel].sha256, /^[0-9a-f]{64}$/, `${rel} carries a sha256`);
      }
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('test_when_package_json_read_then_runtime_deps_unchanged_and_esbuild_is_devdep', async () => {
    const pkg = JSON.parse(await readFile(path.join(REPO_ROOT, 'package.json'), 'utf8'));
    assert.deepEqual(pkg.dependencies, { '@clack/prompts': '1.4.0' },
      'runtime dependencies must remain exactly {@clack/prompts}');
    assert.equal(pkg.devDependencies?.esbuild, '0.28.1', 'esbuild pinned exactly in devDependencies');
  });

  it('test_when_bad_entry_then_helper_exits_nonzero_no_partial_output', { timeout: 60000 }, async () => {
    // Covers AC-004.
    const m = requireModule();
    const dir = await mkdtemp(path.join(os.tmpdir(), 'bundle-bad-'));
    await mkdir(path.join(dir, '.claude', 'mcp', 'sprint-channel'), { recursive: true });
    // no server.mjs entry present → esbuild has nothing to bundle
    try {
      await assert.rejects(() => m.bundleServers(dir),
        'bundleServers must reject when a target entry is missing');
      const contents = existsSync(path.join(dir, '.claude', 'mcp', 'sprint-channel'))
        ? await readdir(path.join(dir, '.claude', 'mcp', 'sprint-channel')) : [];
      assert.ok(!contents.includes('server.mjs'), 'no partial bundle written on failure');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('test_when_dev_tree_server_read_then_still_imports_sdk', async () => {
    // Regression trap: only obj/template's copy is bundled; the dev-tree source
    // stays readable/unbundled (still imports the SDK by bare specifier).
    const src = await readFile(path.join(REPO_ROOT, '.claude', 'mcp', 'sprint-channel', 'server.mjs'), 'utf8');
    assert.match(src, /@modelcontextprotocol\/sdk/, 'dev-tree server.mjs must remain unbundled (bare SDK import)');
  });
});
