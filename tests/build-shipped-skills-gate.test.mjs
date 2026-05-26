// Tests for the build-time gate that wires scan-shipped-skills.mjs into
// scripts/build-template.sh between Stage 1.5 (prune dev-only) and Stage 3
// (build manifest). Two layers:
//
//   1. Structural — assert build-template.sh contains the scanner invocation
//      between the prune and manifest stages, AND a non-zero-exit conditional.
//   2. Behavioral — invoke scan-shipped-skills.mjs against a synthetic
//      obj/template/ that contains a planted-BLOCKER SKILL.md; assert exit 2
//      and a BLOCKED report. This is the scanner contract the gate consumes;
//      end-to-end build invocation is out of scope (too slow, side-effectful).
//
// Spec: docs/specs/marker-helper-shipped-instead-of-dev-import.md

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, copyFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');
const BUILD_SH = join(repoRoot, 'scripts/build-template.sh');
const SCANNER = join(repoRoot, '.claude/skills/spec-shippability-review/scan-shipped-skills.mjs');
const FIXTURES_DIR = join(repoRoot, '.claude/skills/spec-shippability-review/tests/fixtures');

function readBuildScript() {
  return readFile(BUILD_SH, 'utf8');
}

function lineOfFirstMatch(text, re) {
  const m = text.search(re);
  if (m === -1) return -1;
  return text.slice(0, m).split('\n').length;
}

describe('build-template.sh — Stage 1.6 scan wiring (structural)', () => {
  // AC-005 — build aborts on BLOCKER from scan-shipped-skills.mjs before manifest stamp
  it('test_when_build_template_sh_runs_stage_1_6_then_invokes_scan_shipped_skills', async () => {
    const text = await readBuildScript();
    assert.match(text, /scan-shipped-skills\.mjs/,
      'build-template.sh must invoke scan-shipped-skills.mjs');

    // Match actual command invocations (anchored with `node`), not stray
    // textual mentions in comments. The build script comments reference both
    // "build-manifest.mjs" and "prune dev-only" descriptively; ordering must
    // be evaluated on the executable lines.
    const lineScan = lineOfFirstMatch(text, /node\s+"?\$\{?SCANNER\}?"?|node\s+\S*scan-shipped-skills\.mjs/);
    const linePrune = lineOfFirstMatch(text, /^for\s+skill_md\s+in/m);
    const lineManifest = lineOfFirstMatch(text, /^node\s+"?\$\{?SCRIPT_DIR\}?"?\/build-manifest\.mjs/m);

    assert.ok(linePrune > 0, 'prune stage must be present');
    assert.ok(lineManifest > 0, 'manifest stage must be present');
    assert.ok(
      lineScan > linePrune && lineScan < lineManifest,
      `scan invocation must sit between prune (line ${linePrune}) and manifest (line ${lineManifest}); got line ${lineScan}`,
    );
  });

  it('test_when_scan_exits_non_zero_then_build_aborts_before_manifest', async () => {
    const text = await readBuildScript();
    // Match either explicit exit-code branch or an `if !` / `||` chain that
    // halts the build. The exact shape is up to implement; this test asserts
    // the gate is present in some form: a non-zero scanner exit must abort.
    assert.match(text, /scan-shipped-skills\.mjs[\s\S]{0,500}?(exit\s+1|build aborted|>&2)/,
      'a non-zero exit from the scanner must abort the build (exit / "build aborted" / stderr redirect)');
  });
});

describe('build-template.sh — Stage 1.6 scan gate (behavioral)', () => {
  it('test_when_build_template_gate_runs_with_planted_blocker_then_aborts_with_error', async () => {
    const project = await mkdtemp(join(tmpdir(), 'build-gate-'));
    try {
      // Synthetic obj/template/.claude/skills/ that contains the blocker
      // fixture. The build wires the scanner against obj/template/, but the
      // scanner accepts any --root; we test the scanner directly with the
      // fixture-derived root since that's the contract the gate consumes.
      const fixtureRoot = join(FIXTURES_DIR, 'shipped-skill-blocker');
      const dstSkillsRoot = join(project, '.claude/skills');
      await mkdir(join(dstSkillsRoot, 'planted'), { recursive: true });
      await copyFile(
        join(fixtureRoot, 'planted/SKILL.md'),
        join(dstSkillsRoot, 'planted/SKILL.md'),
      );
      // Seed an empty manifest so C3 has data and the scanner can complete.
      await mkdir(join(project, 'obj/template/.claude'), { recursive: true });
      await writeFile(
        join(project, 'obj/template/.claude/manifest.json'),
        JSON.stringify({ files: {} }, null, 2),
      );

      const result = spawnSync('node', [SCANNER, '--root', dstSkillsRoot, '--report-root', project], {
        encoding: 'utf8',
        cwd: project,
      });
      assert.equal(result.status, 2,
        `scanner must exit 2 on BLOCKER; got ${result.status}\nstdout=${result.stdout}\nstderr=${result.stderr}`);

      const reportPath = join(project, '.claude/state/spec-shippability/shipped-skills.json');
      assert.ok(existsSync(reportPath), 'report file must exist after scan');
      const report = JSON.parse(await readFile(reportPath, 'utf8'));
      assert.equal(report.verdict, 'BLOCKED');
      assert.ok(report.findings.some((f) => f.severity === 'BLOCKER'),
        `report must contain at least one BLOCKER; got: ${JSON.stringify(report.findings)}`);
    } finally {
      await rm(project, { recursive: true, force: true });
    }
  });
});
