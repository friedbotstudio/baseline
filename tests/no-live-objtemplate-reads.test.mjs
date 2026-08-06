// Meta-test (AC-002 / AC-003 / AC-004): the default test tier must contain NO
// un-isolated writer of a live `obj/` tree the audit reads. The intermittent
// parallel flake (landmine: live-objtemplate-rebuild-races-parallel-test-readers)
// is caused by a WRITER — `npm pack` / `npm run build` / `build-template.sh` run
// against the live repo root rebuilds `obj/template` while sibling tests read
// it. Remove every default-tier writer (gate it behind PUBLISH_TESTS, or run it
// inside an isolated tmp clone) and the readers stop racing.
//
// TWO TREES, NOT ONE. audit-baseline reads `obj/template/.claude/manifest.json`
// (checks/context.mjs → loadManifest) AND five pages under `obj/site/`
// (checks/docsite-drift.mjs). `npm run build:site` was excluded here while only
// the first was true; docsite-drift landed afterwards and made the site build a
// racing writer too. Scope is therefore the whole live `obj/` tree.
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
// / `build-template.sh` / `npm run build:site` mutates a tree the audit reads.
const ISOLATION = /cloneAndBuild|buildShippedClaudeDir|cloneRepo|mkdtemp|PKG_ROOT|buildSiteIsolated|ensureSiteBuilt/;
const GATE = /PUBLISH_TESTS/;
const HAS_EXEC = /\b(execSync|execFileSync|exec|spawnSync|spawn)\s*\(/;
const EXEC_CALL = '(execSync|execFileSync|exec|spawnSync|spawn)\\s*\\(';

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

// A build script reached through a CONST is still an executed build. This is the
// shape tests/manifest-refresh.test.mjs used —
//   const BUILD_SH = path.join(REPO, 'scripts/build-template.sh');
//   spawnSync('bash', [BUILD_SH, '--manifest-only'], { cwd: REPO })
// — which the literal-only scan never saw, so an un-isolated writer of the live
// obj/template sat in the default tier unreported.
function execsViaBoundName(text, scriptPattern) {
  const bindings = text.matchAll(
    new RegExp(`(?:const|let|var)\\s+([A-Za-z_$][\\w$]*)\\s*=[^;\\n]*${scriptPattern}`, 'g'),
  );
  for (const [, name] of bindings) {
    if (new RegExp(`${EXEC_CALL}[^)]*\\b${name}\\b`, 's').test(text)) return true;
  }
  return false;
}

function executesLiveWriter(text) {
  if (!HAS_EXEC.test(text)) return false;
  // `npm pack --ignore-scripts` skips prepack → no obj/template rebuild → not a
  // writer. A bare `npm pack` (no --ignore-scripts) DOES rebuild via prepack.
  const packsWithoutIgnoreScripts =
    (/npm\s+pack\b/.test(text) || (/['"`]npm['"`]/.test(text) && /['"`]pack['"`]/.test(text))) &&
    !/--ignore-scripts|['"`]--ignore-scripts['"`]/.test(text);
  const execsBuildSh =
    new RegExp(`${EXEC_CALL}[^)]*build-template\\.sh`, 's').test(text) ||
    execsViaBoundName(text, 'build-template\\.sh');
  const execsNpmRunBuild = (/npm\s+run\s+build\b/.test(text) || /run['"`]\s*,\s*['"`]build['"`]/.test(text)) && !/build:site/.test(text);
  // obj/site is the audit's SECOND live read (checks/docsite-drift.mjs), so a
  // site build against the live tree races the same readers obj/template does.
  const execsBuildSite = new RegExp(`${EXEC_CALL}[^)]*build:site`, 's').test(text);
  return packsWithoutIgnoreScripts || execsBuildSh || execsNpmRunBuild || execsBuildSite;
}

function isUnisolatedWriter(text) {
  const code = stripComments(text);
  if (!executesLiveWriter(code)) return false;
  // A writer is safe iff it runs in isolation OR the whole file is gated behind
  // PUBLISH_TESTS (heavy on-demand tier).
  return !ISOLATION.test(code) && !GATE.test(code);
}

// Scan the shared helpers too: moving a build behind helpers/ hides it from a
// *.test.mjs-only scan while it keeps writing the same live tree.
function scannedFiles() {
  const files = readdirSync(TESTS_DIR)
    .filter((name) => name.endsWith('.test.mjs') && name !== SELF)
    .map((name) => ({ label: name, path: join(TESTS_DIR, name) }));
  for (const name of readdirSync(join(TESTS_DIR, 'helpers'))) {
    if (name.endsWith('.mjs')) {
      files.push({ label: `helpers/${name}`, path: join(TESTS_DIR, 'helpers', name) });
    }
  }
  return files;
}

function findOffenders() {
  const offenders = [];
  for (const { label, path } of scannedFiles()) {
    if (isUnisolatedWriter(readFileSync(path, 'utf8'))) offenders.push(label);
  }
  return offenders;
}

describe('default tier has no un-isolated live-obj writer', () => {
  it('test_when_default_tier_scanned_then_no_unisolated_live_obj_writer', () => {
    const offenders = findOffenders();
    assert.deepEqual(
      offenders,
      [],
      `These default-tier tests write a live obj/ tree the audit reads (obj/template via ` +
        `checks/context.mjs loadManifest, obj/site via checks/docsite-drift.mjs) without isolation ` +
        `or a PUBLISH_TESTS gate, causing the parallel race. Gate them, or point their build at a ` +
        `tmp clone / --output dir:\n  ${offenders.join('\n  ')}`,
    );
  });

  it('test_when_writer_path_is_behind_a_const_then_guard_flags_it', () => {
    // tests/manifest-refresh.test.mjs binds the build script to BUILD_SH and then
    // executes the CONST, so the literal `build-template.sh` never appears inside
    // the exec-call parens the detector scans. An un-isolated live writer the
    // guard has never reported.
    assert.equal(
      isUnisolatedWriter(
        "const BUILD_SH = path.join(REPO, 'scripts/build-template.sh');\n" +
          "spawnSync('bash', [BUILD_SH, '--manifest-only'], { cwd: REPO, encoding: 'utf8' })",
      ),
      true,
    );
    // Same indirection, but built in a tmp clone — isolated, so not an offender.
    assert.equal(
      isUnisolatedWriter(
        "const BUILD_SH = path.join(REPO, 'scripts/build-template.sh');\n" +
          "const tmp = await mkdtemp(join(tmpdir(), 'x'));\n" +
          "spawnSync('bash', [BUILD_SH], { cwd: tmp, env: { ...process.env, PKG_ROOT: tmp } })",
      ),
      false,
    );
  });

  it('test_when_build_site_executed_unisolated_then_guard_flags_it', () => {
    // `npm run build:site` rewrites the live obj/site. That was harmless when the
    // audit did not read obj/site; checks/docsite-drift.mjs now reads five pages
    // out of it, so the exclusion this guard used to carry is stale.
    assert.equal(
      isUnisolatedWriter("spawnSync('npm', ['run', 'build:site'], {cwd: REPO_ROOT})"),
      true,
    );
    // Redirected to its own output dir, the site build touches nothing shared.
    assert.equal(
      isUnisolatedWriter(
        "const out = await mkdtemp(join(tmpdir(), 'site-'));\n" +
          "spawnSync('npx', ['eleventy', '--output', out], {cwd: REPO_ROOT})",
      ),
      false,
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
    assert.equal(isUnisolatedWriter("execFileSync('npm', ['pack', '--dry-run', '--ignore-scripts', '--json'], {cwd: repoRoot})"), false);
    assert.equal(isUnisolatedWriter('const x = 1;'), false);
  });
});
