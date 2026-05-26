// Tests for .claude/skills/spec-shippability-review/scan-shipped-skills.mjs —
// the new scanner that walks shipped SKILL.md files and applies C1
// (DEV_TREE_RUNTIME_REF) + C3 (UNSHIPPED_MODULE_IMPORT) to their bash fences.
//
// Complements tests/spec-shippability-review.test.mjs, which exercises
// check.mjs against per-slug spec drafts. This file exercises the aggregate
// shipped-SKILL.md scan + the regression contract for the v0.8.1 bug.
//
// Spec: docs/specs/marker-helper-shipped-instead-of-dev-import.md

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');
const SCANNER = join(repoRoot, '.claude/skills/spec-shippability-review/scan-shipped-skills.mjs');
const FIXTURES_DIR = join(repoRoot, '.claude/skills/spec-shippability-review/tests/fixtures');

function runScanner(args, opts = {}) {
  return spawnSync('node', [SCANNER, ...args], { encoding: 'utf8', ...opts });
}

async function readReport(projectRoot) {
  const path = join(projectRoot, '.claude/state/spec-shippability/shipped-skills.json');
  if (!existsSync(path)) return null;
  return JSON.parse(await readFile(path, 'utf8'));
}

async function setupScannerProject({ skillsRootRel = '.claude/skills', manifestFiles = null } = {}) {
  const tmp = await mkdtemp(join(tmpdir(), 'shipped-skill-scan-'));
  await mkdir(join(tmp, skillsRootRel), { recursive: true });
  if (manifestFiles !== null) {
    await mkdir(join(tmp, 'obj/template/.claude'), { recursive: true });
    await writeFile(
      join(tmp, 'obj/template/.claude/manifest.json'),
      JSON.stringify({ files: manifestFiles }, null, 2),
    );
  }
  return tmp;
}

async function copyFixtureSkill(srcFixtureDir, dstSkillsRoot, slug) {
  await mkdir(join(dstSkillsRoot, slug), { recursive: true });
  const src = await readFile(join(srcFixtureDir, slug, 'SKILL.md'), 'utf8');
  await writeFile(join(dstSkillsRoot, slug, 'SKILL.md'), src);
}

describe('scan-shipped-skills — clean tree on the real repo', () => {
  // AC-003 — shipped upgrade-project SKILL.md is CLEAN (no src/cli/ references after fix)
  // AC-006 — regression test asserts current tree passes; would fail against pre-fix tree
  it('test_when_scan_shipped_skills_runs_against_current_tree_then_exits_0_clean', async () => {
    const result = runScanner(['--root', join(repoRoot, '.claude/skills'), '--report-root', repoRoot], { cwd: repoRoot });
    assert.equal(result.status, 0,
      `expected exit 0 against current tree; got ${result.status}\nstdout=${result.stdout}\nstderr=${result.stderr}`);
    assert.match(result.stdout, /Verdict: CLEAN/,
      `stdout must declare CLEAN verdict; got: ${result.stdout}`);
    const report = await readReport(repoRoot);
    assert.ok(report, 'report file must exist after scan');
    assert.equal(report.verdict, 'CLEAN');
    assert.deepEqual(report.findings, [],
      `expected zero findings; got: ${JSON.stringify(report.findings)}`);
  });
});

describe('scan-shipped-skills — planted regressions', () => {
  // AC-004 — scanner detects planted dev-tree refs and unshipped .claude/ imports (+ negative root)
  it('test_when_scan_finds_planted_dev_tree_ref_then_emits_BLOCKER_and_exits_2', async () => {
    const fixtureRoot = join(FIXTURES_DIR, 'shipped-skill-blocker');
    const project = await setupScannerProject({ manifestFiles: {} });
    try {
      // Copy fixture into the project's .claude/skills/
      await copyFixtureSkill(fixtureRoot, join(project, '.claude/skills'), 'planted');

      const result = runScanner(['--root', join(project, '.claude/skills'), '--report-root', project], { cwd: project });
      assert.equal(result.status, 2,
        `expected exit 2 (BLOCKED); got ${result.status}\nstdout=${result.stdout}\nstderr=${result.stderr}`);

      const report = await readReport(project);
      assert.ok(report, 'report file must exist');
      assert.equal(report.verdict, 'BLOCKED');

      const blockerFindings = report.findings.filter(
        (f) => f.severity === 'BLOCKER' && f.check === 'DEV_TREE_RUNTIME_REF',
      );
      assert.equal(blockerFindings.length, 1,
        `expected exactly one BLOCKER DEV_TREE_RUNTIME_REF; got ${blockerFindings.length}: ${JSON.stringify(report.findings)}`);
      assert.match(blockerFindings[0].evidence, /src\/foo\.js/,
        'evidence must contain src/foo.js');
      assert.match(blockerFindings[0].file, /planted\/SKILL\.md$/,
        'finding.file must reference the planted SKILL.md');
    } finally {
      await rm(project, { recursive: true, force: true });
    }
  });

  it('test_when_scan_finds_unshipped_claude_module_import_then_emits_UNSHIPPED_MODULE_IMPORT', async () => {
    const fixtureRoot = join(FIXTURES_DIR, 'shipped-skill-unshipped');
    const project = await setupScannerProject({ manifestFiles: {} });
    try {
      await copyFixtureSkill(fixtureRoot, join(project, '.claude/skills'), 'planted');

      const result = runScanner(['--root', join(project, '.claude/skills'), '--report-root', project], { cwd: project });
      assert.equal(result.status, 2,
        `expected exit 2; got ${result.status}\nstderr=${result.stderr}`);

      const report = await readReport(project);
      const matching = report.findings.filter(
        (f) => f.severity === 'BLOCKER' && f.check === 'UNSHIPPED_MODULE_IMPORT',
      );
      assert.ok(matching.length >= 1,
        `expected at least one BLOCKER UNSHIPPED_MODULE_IMPORT; got: ${JSON.stringify(report.findings)}`);
      assert.ok(matching.some((f) => /notinmanifest\/helper\.mjs/.test(f.evidence)),
        'evidence must contain notinmanifest/helper.mjs');
    } finally {
      await rm(project, { recursive: true, force: true });
    }
  });

  it('test_when_scan_root_missing_then_exits_3', async () => {
    const bogus = join(tmpdir(), `definitely-does-not-exist-${Date.now()}-${Math.random()}`);
    const result = runScanner(['--root', bogus]);
    assert.equal(result.status, 3,
      `expected exit 3 on missing root; got ${result.status}; stderr=${result.stderr}`);
    assert.match(result.stderr, /(missing|not found|ENOENT)/i,
      'stderr must name the missing-root error');
  });
});

describe('scan-shipped-skills — regression contract on upgrade-project SKILL.md', () => {
  it('test_when_upgrade_project_skill_md_scanned_then_zero_src_cli_refs_in_file', async () => {
    // Whole-file substring scan rather than fence-only scan: the v0.8.1 bug
    // lived inside an indented bare ``` fence (no language tag), which a
    // tagged-fence regex would miss. The regression contract is "this file
    // must not reference src/cli/ anywhere" — strictly stronger than the
    // scanner's fence-aware check and exactly the bug we're closing.
    const path = join(repoRoot, '.claude/skills/upgrade-project/SKILL.md');
    const text = await readFile(path, 'utf8');
    const lines = text.split('\n');
    const offending = lines
      .map((line, i) => ({ line, lineNumber: i + 1 }))
      .filter(({ line }) => line.includes('src/cli/'));
    assert.deepEqual(offending, [],
      `upgrade-project SKILL.md must not reference src/cli/ anywhere; got: ${JSON.stringify(offending)}`);
  });
});
