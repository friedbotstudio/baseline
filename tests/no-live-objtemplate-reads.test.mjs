// Meta-test (AC-002 / AC-003 / AC-004): the default test tier must contain NO
// un-isolated writer of the live `obj/template` tree. The intermittent parallel
// flake (landmine: live-objtemplate-rebuild-races-parallel-test-readers) is
// caused by a WRITER — `npm pack` / `npm run build` / `build-template.sh` run
// against the live repo root rebuilds `obj/template` while sibling tests read
// it. Remove every default-tier writer (gate it behind PUBLISH_TESTS, or run it
// inside an isolated tmp clone) and the readers stop racing.
//
// This test FAILS while any default-tier test invokes a build/pack against the
// live tree without isolation; it PASSES once those are gated or isolated.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const TESTS_DIR = dirname(fileURLToPath(import.meta.url));
const SELF = 'no-live-objtemplate-reads.test.mjs';

// Foundation: detect a live-tree WRITER that is neither isolated nor gated.
// Precision matters — a mere mention of `build-template.sh` in a comment or an
// assertion string is NOT a writer; only an EXECUTED `npm pack` / `npm run build`
// / `build-template.sh` mutates the tree. `npm run build:site` builds obj/site
// (not obj/template) and is excluded.
const ISOLATION = /cloneAndBuild|buildShippedClaudeDir|cloneRepo|mkdtemp|PKG_ROOT/;
const GATE = /PUBLISH_TESTS/;
const HAS_EXEC = /\b(execSync|execFileSync|exec|spawnSync|spawn)\s*\(/;

// Strip comments before writer-detection so a mere PROSE mention of `npm pack`
// or `build-template.sh` (e.g. a header docblock explaining the lock) is never
// treated as an executed writer — this guard flags only EXECUTED writers (see
// the docblock above). Removes block comments and whole-line `//` comments;
// whole-line stripping avoids the `://`-in-string-literal edge case.
function stripComments(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n')
    .filter((line) => !/^\s*\/\//.test(line))
    .join('\n');
}

function executesLiveWriter(text) {
  if (!HAS_EXEC.test(text)) return false;
  // `npm pack --ignore-scripts` skips prepack → no obj/template rebuild → not a
  // writer. A bare `npm pack` (no --ignore-scripts) DOES rebuild via prepack.
  const packsWithoutIgnoreScripts =
    (/npm\s+pack\b/.test(text) || (/['"`]npm['"`]/.test(text) && /['"`]pack['"`]/.test(text))) &&
    !/--ignore-scripts|['"`]--ignore-scripts['"`]/.test(text);
  const execsBuildSh = /(execSync|execFileSync|exec|spawnSync|spawn)\s*\([^)]*build-template\.sh/s.test(text);
  const execsNpmRunBuild = (/npm\s+run\s+build\b/.test(text) || /run['"`]\s*,\s*['"`]build['"`]/.test(text)) && !/build:site/.test(text);
  return packsWithoutIgnoreScripts || execsBuildSh || execsNpmRunBuild;
}

function isUnisolatedWriter(text) {
  const code = stripComments(text);
  if (!executesLiveWriter(code)) return false;
  // A writer is safe iff it runs in isolation OR the whole file is gated behind
  // PUBLISH_TESTS (heavy on-demand tier).
  return !ISOLATION.test(code) && !GATE.test(code);
}

function findOffenders() {
  const offenders = [];
  for (const name of readdirSync(TESTS_DIR)) {
    if (!name.endsWith('.test.mjs') || name === SELF) continue;
    const text = readFileSync(join(TESTS_DIR, name), 'utf8');
    if (isUnisolatedWriter(text)) offenders.push(name);
  }
  return offenders;
}

describe('default tier has no un-isolated live-obj/template writer', () => {
  it('test_when_default_tier_scanned_then_no_unguarded_live_objtemplate_writer', () => {
    const offenders = findOffenders();
    assert.deepEqual(
      offenders,
      [],
      `These default-tier tests write the live obj/template without isolation or a PUBLISH_TESTS gate, ` +
        `causing the parallel race. Gate them or run their build/pack in a tmp clone:\n  ${offenders.join('\n  ')}`,
    );
  });

  it('test_when_detector_sees_unisolated_pack_then_it_flags', () => {
    // Detector self-check: an EXECUTED un-isolated writer must be flagged; an
    // isolated/gated one must not; and a mere text mention must NOT — so the
    // invariant test can never silently pass empty, nor false-positive on prose.
    assert.equal(isUnisolatedWriter("execSync('npm pack --dry-run', {cwd: repoRoot})"), true);
    assert.equal(isUnisolatedWriter("const tmp = await cloneRepo('x'); execFileSync('npm', ['pack'], {cwd: tmp})"), false);
    assert.equal(isUnisolatedWriter("it('x', {skip: process.env.PUBLISH_TESTS ? false : 'reason'}, () => execSync('npm pack'))"), false);
    assert.equal(isUnisolatedWriter("// scripts/build-template.sh Stage 0b — assert it contains a block"), false);
    // A whole-line comment mentioning `npm pack` alongside an UNRELATED exec
    // (e.g. spawning a small helper) must NOT flag — prose is not a writer.
    assert.equal(isUnisolatedWriter("// prepack (npm pack) + a live-tree build share one lock\nconst r = spawnSync('node', [SCRIPT, dir]);"), false);
    assert.equal(isUnisolatedWriter("spawnSync('npm', ['run', 'build:site'], {cwd: REPO_ROOT})"), false);
    assert.equal(isUnisolatedWriter("execFileSync('npm', ['pack', '--dry-run', '--ignore-scripts', '--json'], {cwd: repoRoot})"), false);
    assert.equal(isUnisolatedWriter('const x = 1;'), false);
  });
});
