// AC-003 — When oldManifest.baseline_version === runningCliVersion AND no pending
// stage AND every dry-run action would be NOOP/MARKER_MATCHED/NEVER_TOUCH_PRESERVE
// /SPECIAL_MERGE-with-wrote-false, the upgrade CLI prints "already on baseline
// X.Y.Z; nothing to do" and exits 0 with zero filesystem writes.
//
// Spec: docs/specs/upgrade-version-aware-noop.md §Behavior #3.
// Current behavior: full three-way merge runs even on no-op upgrades; .mcp.json
// gets rewritten to byte-identical content; "Applied 1 update(s)" is reported.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

const install = await import('../src/cli/install.js');

let tuiUpgrade;
try {
  tuiUpgrade = await import('../src/cli/tui/upgrade.js');
} catch (err) {
  throw new Error(`Cannot import src/cli/tui/upgrade.js: ${err.message}`);
}

async function readPackageJsonVersion() {
  const pkg = JSON.parse(await readFile(join(REPO_ROOT, 'package.json'), 'utf8'));
  return pkg.version;
}

async function makeTemplateFixture(claudeBody = '# baseline v1\n') {
  const tplDir = await mkdtemp(join(tmpdir(), 'baseline-fp-tpl-'));
  await mkdir(join(tplDir, '.claude'));
  await writeFile(join(tplDir, 'CLAUDE.md'), claudeBody);
  await writeFile(join(tplDir, '.mcp.json'), JSON.stringify({ mcpServers: {} }, null, 2) + '\n');
  await writeFile(join(tplDir, '.claude/project.json'), JSON.stringify({ configured: false }, null, 2) + '\n');
  await mkdir(join(tplDir, 'docs/init'), { recursive: true });
  await writeFile(join(tplDir, 'docs/init/seed.md'), '# seed\n');
  return tplDir;
}

function makePromptsStub() {
  const calls = [];
  return {
    calls,
    stub: {
      intro: (m) => calls.push({ kind: 'intro', m }),
      outro: (m) => calls.push({ kind: 'outro', m }),
      cancel: (m) => calls.push({ kind: 'cancel', m }),
      log: {
        info: (m) => calls.push({ kind: 'log.info', m }),
        warn: (m) => calls.push({ kind: 'log.warn', m }),
        error: (m) => calls.push({ kind: 'log.error', m }),
        step: (m) => calls.push({ kind: 'log.step', m }),
        success: (m) => calls.push({ kind: 'log.success', m }),
      },
      spinner: () => ({ start() {}, message() {}, stop() {}, error() {} }),
      select: async () => 'keep-mine',
      isCancel: () => false,
    },
  };
}

async function collectMtimes(target) {
  const paths = [
    join(target, '.claude/.baseline-manifest.json'),
    join(target, '.mcp.json'),
    join(target, '.claude/project.json'),
  ];
  const out = {};
  for (const p of paths) {
    try { out[p] = (await stat(p)).mtimeMs; } catch { out[p] = null; }
  }
  return out;
}

describe('upgrade fast-path (AC-003)', () => {
  it('test_when_version_matches_and_no_delta_then_fast_path_short_circuits_with_zero_writes', async () => {
    const tpl = await makeTemplateFixture('# baseline v1\n');
    const target = await mkdtemp(join(tmpdir(), 'baseline-fp-target-'));
    const currentVersion = await readPackageJsonVersion();

    // Fresh install — this should stamp baseline_version into both manifest and project.json
    // (per AC-001). After install, target's state mirrors the template exactly.
    await install.freshInstall(tpl, target);

    // Sanity: the manifest's baseline_version matches what the upgrade run will read
    // from package.json. If install fails to stamp it, the precondition for AC-003 isn't
    // met and the fast-path will (correctly) miss.
    const manifestBefore = JSON.parse(await readFile(join(target, '.claude/.baseline-manifest.json'), 'utf8'));
    assert.equal(manifestBefore.baseline_version, currentVersion,
      `precondition: install must stamp baseline_version === ${currentVersion}; got ${JSON.stringify(manifestBefore.baseline_version)}. AC-001 covers this.`);

    // Snapshot mtimes just before upgrade.
    const mtimeBefore = await collectMtimes(target);
    // Tiny delay so any rewrite would produce a measurably different mtime on coarse FS.
    await new Promise((r) => setTimeout(r, 15));

    const { calls, stub } = makePromptsStub();
    const exitCode = await tuiUpgrade.run({
      target,
      opts: { templateDir: tpl }, // same templateDir as install — no template delta
      prompts: stub,
    });

    assert.equal(exitCode, 0, 'fast-path hit must exit 0');

    const messages = calls.map((c) => typeof c.m === 'string' ? c.m : JSON.stringify(c)).join('\n');
    assert.ok(
      /already on baseline/i.test(messages) && new RegExp(currentVersion.replace(/\./g, '\\.')).test(messages),
      `fast-path hit must surface "already on baseline ${currentVersion}" via @clack/prompts; messages were:\n${messages}`,
    );
    assert.ok(
      !/Applied \d+ update/i.test(messages),
      `fast-path hit must NOT print "Applied N update(s)"; messages were:\n${messages}`,
    );

    const mtimeAfter = await collectMtimes(target);
    for (const path of Object.keys(mtimeBefore)) {
      if (mtimeBefore[path] === null) continue; // file absent — skip
      assert.equal(
        mtimeAfter[path],
        mtimeBefore[path],
        `fast-path must not rewrite ${path}; mtime drifted (before=${mtimeBefore[path]}, after=${mtimeAfter[path]})`,
      );
    }
  });
});
