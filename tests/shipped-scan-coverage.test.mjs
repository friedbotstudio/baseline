// Ticket consumer-install-defects — D7 (AC-012, AC-015).
//
// The shippability gate aborts the build on a BLOCKER, and it ran on the build
// that shipped D1. It passed because its reach was invisible: one hardcoded root
// (obj/template/.claude/skills) and no assertion anywhere that the root list
// covers what actually ships. These two tests make the gate's own coverage a
// tested property instead of a maintainer's memory.
//
// SCAN_ROOTS is read through a CHILD PROCESS, not imported. scan-shipped-skills.mjs
// currently ends in a bare `await main()` + `process.exit()` with no
// import.meta.url guard, so importing it in-process would run a scan and kill the
// test runner. Implement must add the guard and export SCAN_ROOTS; until then the
// child prints nothing and the assertion below says why.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { REPO_ROOT } from './helpers/memory-fixtures.mjs';

const SCANNER_REL = '.claude/skills/spec-shippability-review/scan-shipped-skills.mjs';
const SHIPPED_CLAUDE = join(REPO_ROOT, 'obj', 'template', '.claude');

// Same wording constraint as build-template-memory-excludes.test.mjs: this file
// execs the scanner, never the build, and no-live-objtemplate-reads.test.mjs
// matches on text including string literals.
const shippedReason = existsSync(SHIPPED_CLAUDE)
  ? false
  : 'obj/ is gitignored build output — build the template before running this tier';

function readScanRoots() {
  const probe = `import('./${SCANNER_REL}').then(m => process.stdout.write(JSON.stringify({ roots: m.SCAN_ROOTS ?? null, exempt: m.SCAN_EXEMPTIONS ?? null })))`;
  let stdout = '';
  try {
    stdout = execFileSync('node', ['-e', probe], { cwd: REPO_ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch {
    stdout = '';
  }
  assert.notEqual(
    stdout.trim(),
    '',
    `${SCANNER_REL} must be importable and must export SCAN_ROOTS + SCAN_EXEMPTIONS. It currently ends in a bare \`await main()\` and \`process.exit()\`, so importing it runs a scan and exits — add an \`import.meta.url\` main guard, the same shape audit.mjs already uses`,
  );
  return JSON.parse(stdout);
}

function shippedTopLevelDirs() {
  return readdirSync(SHIPPED_CLAUDE, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();
}

describe('D7 — the gate\'s own reach is asserted, not remembered (AC-012)', () => {
  it('test_when_a_shipped_directory_has_no_descriptor_then_the_suite_fails', { skip: shippedReason }, () => {
    const { roots, exempt } = readScanRoots();
    assert.ok(Array.isArray(roots), 'SCAN_ROOTS must be an array of descriptors');
    assert.ok(exempt && typeof exempt === 'object', 'SCAN_EXEMPTIONS must map an exempted directory name to a written reason');

    const covered = new Set(roots.map((d) => d.dir ?? d.id));
    const uncovered = shippedTopLevelDirs().filter((dir) => !covered.has(dir) && !(dir in exempt));

    assert.deepEqual(
      uncovered,
      [],
      `these shipped directories are neither scanned nor exempted: ${uncovered.join(', ')}. A surface that ships unscanned is how D1 reached users — add a descriptor, or an exemption naming why it cannot carry a runtime path`,
    );

    for (const [dir, reason] of Object.entries(exempt)) {
      assert.ok(
        typeof reason === 'string' && reason.trim().length > 0,
        `exemption for "${dir}" must carry a reason — a bare exemption is the silent gap with extra steps`,
      );
    }
  });
});

describe('D1 + D8 — no shipped command names a dev-only path (AC-015)', () => {
  // --report-root goes to a temp dir on purpose. The scanner's default report root
  // is '.', so running it at REPO_ROOT would overwrite the live
  // .claude/state/spec-shippability/shipped-skills.json mid-workflow.
  it('test_when_the_shipped_commands_are_scanned_then_zero_blockers_remain', { skip: shippedReason }, () => {
    const reportRoot = mkdtempSync(join(tmpdir(), 'scancov-'));
    let stdout = '';
    try {
      stdout = execFileSync(
        'node',
        [join(REPO_ROOT, SCANNER_REL), '--report-root', reportRoot, '--manifest', join(SHIPPED_CLAUDE, 'manifest.json')],
        { cwd: REPO_ROOT, encoding: 'utf8' },
      );
    } catch (err) {
      stdout = String(err.stdout ?? '');
    }

    assert.match(
      stdout,
      /commands/,
      'the run must show that command surfaces were in scope. Asserting "zero command blockers" while commands are never scanned passes vacuously — that false green is exactly how the D3 seam defect survived a suite',
    );

    const commandBlockers = stdout
      .split('\n')
      .filter((line) => line.includes('.claude/commands/') && /BLOCKER|DEV_TREE_RUNTIME_REF/.test(line));

    assert.deepEqual(
      commandBlockers,
      [],
      `shipped commands still name dev-only paths:\n  ${commandBlockers.join('\n  ')}\nEight were measured before this change — one in /init-project for D1, six in /init-project-doctor for D8, and a second /init-project reference to src/cli/install.js`,
    );
  });
});
