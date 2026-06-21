// constitution-mirror-autosync — drives scripts/sync-constitution-mirror.mjs +
// build-template.sh Stage 0b + the package.json sync:constitution script.
//
// The helper reconciles the live constitution (docs/init/seed.md, CLAUDE.md)
// into the derived shippable mirrors (src/seed.template.md, src/CLAUDE.template.md):
//   - seed is SPLICED: liveHead(<§16) + template's reserved §16 block + liveTail(§17..)
//   - CLAUDE.md is a FULL byte-for-byte copy
// It accepts a --root / {rootDir} so tests isolate against a tmp fixture tree
// and never touch the real src/*.template.md.
//
// Unit tests dynamic-import the helper inside each test (cache-busted) so the
// module-not-yet-created RED is a per-test failure, not a file-load collapse
// that would also sink the REPO_ROOT structural tests.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, mkdir, readFile, rm } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const HELPER = join(REPO_ROOT, 'scripts', 'sync-constitution-mirror.mjs');

// --- Foundation: fixture strings + tree builder -----------------------------

const SHARED_HEAD =
  '# Genesis seed\n\nShared constitutional body — every project gets this.\n';
const SEC16_LIVE =
  '\n## §16 — Project-specific configuration\n\nGenerated: 2026-01-01\nDetected stack: node; this repo only.\n';
const SEC16_RESERVED =
  '\n## §16 — Project-specific configuration\n\n*Reserved.* Until /init-project runs, this section stays empty.\n';
const SHARED_TAIL =
  '\n## §17 — Skill provenance\n\nShared tail — every project gets this.\n';

const LIVE_SEED = SHARED_HEAD + SEC16_LIVE + SHARED_TAIL;
const IN_SYNC_SEED_TEMPLATE = SHARED_HEAD + SEC16_RESERVED + SHARED_TAIL;
const LIVE_CLAUDE = '# Constitution\n\nArticle I — body.\n';

/** Write a fixture project tree at root; returns root. */
async function writeTree(root, { seedLive, seedTemplate, claudeLive, claudeTemplate }) {
  await mkdir(join(root, 'docs', 'init'), { recursive: true });
  await mkdir(join(root, 'src'), { recursive: true });
  if (seedLive !== null) await writeFile(join(root, 'docs', 'init', 'seed.md'), seedLive);
  if (claudeLive !== null) await writeFile(join(root, 'CLAUDE.md'), claudeLive);
  await writeFile(join(root, 'src', 'seed.template.md'), seedTemplate);
  await writeFile(join(root, 'src', 'CLAUDE.template.md'), claudeTemplate);
  return root;
}

/** In-sync baseline: templates already equal reconcile(live). */
async function inSyncFixture(overrides = {}) {
  const root = await mkdtemp(join(tmpdir(), 'const-mirror-'));
  return writeTree(root, {
    seedLive: LIVE_SEED,
    seedTemplate: IN_SYNC_SEED_TEMPLATE,
    claudeLive: LIVE_CLAUDE,
    claudeTemplate: LIVE_CLAUDE,
    ...overrides,
  });
}

const readT = (root, rel) => readFileSync(join(root, rel), 'utf8');

/** Dynamic-import the helper, cache-busted so env/state changes are picked up. */
async function loadHelper() {
  return import(`${pathToFileURL(HELPER).href}?t=${Date.now()}-${Math.random()}`);
}

/** Run the CLI with --root pointed at a fixture; returns {status, stdout, stderr}. */
function runCli(root, mode) {
  return spawnSync('node', [HELPER, mode, '--root', root], { encoding: 'utf8' });
}

// --- Unit behavior (against the helper API) ---------------------------------

describe('sync-constitution-mirror — reconcile + splice', () => {
  // Covers AC-004.
  it('test_when_in_sync_tree_check_then_exit_zero', async () => {
    const root = await inSyncFixture();
    try {
      const { reconcile } = await loadHelper();
      const r = await reconcile({ rootDir: root, mode: 'check' });
      assert.equal(r.exitCode, 0, 'in-sync tree must report exit 0');
      assert.deepEqual(r.drifted, [], 'in-sync tree must have no drift');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  // Covers AC-001.
  it('test_when_live_seed_edited_only_check_then_exit_one_and_names_seed_template', async () => {
    const root = await inSyncFixture();
    try {
      // Edit only the live seed shared head; template now stale.
      await writeFile(
        join(root, 'docs', 'init', 'seed.md'),
        LIVE_SEED.replace('Shared constitutional body', 'Shared body — AMENDED'),
      );
      const { reconcile } = await loadHelper();
      const r = await reconcile({ rootDir: root, mode: 'check' });
      assert.equal(r.exitCode, 1, 'drifted tree must report exit 1');
      assert.ok(
        r.drifted.includes('src/seed.template.md'),
        `drifted must name src/seed.template.md; got ${JSON.stringify(r.drifted)}`,
      );
      // CLI surfaces the actionable hint on stderr.
      const cli = runCli(root, '--check');
      assert.equal(cli.status, 1, 'CLI --check on drift exits 1');
      assert.match(cli.stderr, /sync:constitution/, 'CLI must print the fix-command hint');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  // Covers AC-002.
  it('test_when_write_on_drifted_tree_then_seed_spliced_and_claude_verbatim', async () => {
    const amendedSeed = LIVE_SEED
      .replace('Shared constitutional body', 'Shared body — AMENDED HEAD')
      .replace('Shared tail', 'AMENDED TAIL');
    const amendedClaude = '# Constitution\n\nArticle I — AMENDED.\n';
    const root = await inSyncFixture({ seedLive: amendedSeed, claudeLive: amendedClaude });
    try {
      const { reconcile } = await loadHelper();
      const r = await reconcile({ rootDir: root, mode: 'write' });
      const expectedSeed =
        SHARED_HEAD.replace('Shared constitutional body', 'Shared body — AMENDED HEAD') +
        SEC16_RESERVED +
        SHARED_TAIL.replace('Shared tail', 'AMENDED TAIL');
      assert.equal(readT(root, 'src/seed.template.md'), expectedSeed, 'seed spliced: live head+tail, reserved §16');
      assert.equal(readT(root, 'src/CLAUDE.template.md'), amendedClaude, 'CLAUDE copied verbatim');
      assert.ok(
        r.written.includes('src/seed.template.md') && r.written.includes('src/CLAUDE.template.md'),
        `written must list both changed files; got ${JSON.stringify(r.written)}`,
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  // Covers AC-003.
  it('test_when_live_section16_filled_then_template_section16_stays_reserved', async () => {
    // Live seed §16 carries a filled-in run with a Generated: stamp.
    const root = await inSyncFixture({ seedLive: LIVE_SEED });
    try {
      // Drift the head so a write is required, keeping the filled §16 in live.
      await writeFile(
        join(root, 'docs', 'init', 'seed.md'),
        LIVE_SEED.replace('Shared constitutional body', 'Body — AMENDED'),
      );
      const { reconcile } = await loadHelper();
      await reconcile({ rootDir: root, mode: 'write' });
      const tpl = readT(root, 'src/seed.template.md');
      const tpl16 = tpl.slice(tpl.indexOf('\n## §16')).split('\n## §17')[0];
      assert.match(tpl16, /\*Reserved\.\*/, 'template §16 must stay the reserved placeholder');
      assert.doesNotMatch(tpl16, /^Generated:/m, 'no filled-in run stamp may leak into the template §16');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  // Covers AC-004 (idempotency).
  it('test_when_write_run_twice_then_second_run_is_noop', async () => {
    const amendedSeed = LIVE_SEED.replace('Shared constitutional body', 'Body — AMENDED');
    const root = await inSyncFixture({ seedLive: amendedSeed });
    try {
      const { reconcile } = await loadHelper();
      const first = await reconcile({ rootDir: root, mode: 'write' });
      assert.ok(first.written.length > 0, 'first write reconciles the drift');
      const second = await reconcile({ rootDir: root, mode: 'write' });
      assert.deepEqual(second.written, [], 'second write is a no-op (idempotent)');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  // Covers AC-007.
  it('test_when_missing_live_seed_then_exit_two_and_no_partial_write', async () => {
    const root = await inSyncFixture({ seedLive: null });
    try {
      const before = readT(root, 'src/seed.template.md');
      const beforeClaude = readT(root, 'src/CLAUDE.template.md');
      const cli = runCli(root, '--write');
      assert.equal(cli.status, 2, 'missing live source must fail-closed with exit 2');
      assert.equal(readT(root, 'src/seed.template.md'), before, 'seed template unchanged on fail-closed');
      assert.equal(readT(root, 'src/CLAUDE.template.md'), beforeClaude, 'CLAUDE template unchanged on fail-closed');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

// --- Structural wiring (against the real repo) ------------------------------

describe('sync-constitution-mirror — build + npm wiring', () => {
  // Covers AC-005.
  it('test_when_build_template_sh_scanned_then_stage_0b_refs_helper_before_stage_2', () => {
    const text = readFileSync(join(REPO_ROOT, 'scripts', 'build-template.sh'), 'utf8');
    assert.ok(
      text.includes('scripts/sync-constitution-mirror.mjs'),
      'build-template.sh must invoke the constitution mirror helper',
    );
    const idx0b = text.search(/^#\s*Stage\s*0b\b/m);
    const idx2 = text.search(/^#\s*Stage\s*2\b/m);
    const idxHelper = text.indexOf('scripts/sync-constitution-mirror.mjs');
    assert.ok(idx0b >= 0 && idx2 >= 0, 'Stage 0b and Stage 2 markers must both exist');
    assert.ok(idxHelper > idx0b && idxHelper < idx2, 'helper invocation must sit in Stage 0b, before Stage 2 overlay');
  });

  // Covers AC-006.
  it('test_when_package_json_read_then_sync_constitution_maps_to_write', () => {
    const pkg = JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf8'));
    const script = pkg.scripts?.['sync:constitution'] ?? '';
    assert.match(script, /sync-constitution-mirror\.mjs/, 'sync:constitution must call the helper');
    assert.match(script, /--write/, 'sync:constitution must run --write mode');
  });
});
