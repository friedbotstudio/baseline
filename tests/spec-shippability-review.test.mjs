// Tests for .claude/skills/spec-shippability-review/check.mjs.
// Runs the analyzer against four fixtures + asserts verdict + finding shape
// against the expected JSON files.
//
// Fixture path convention: .claude/skills/spec-shippability-review/tests/fixtures/<name>.md
// Expected path convention: .claude/skills/spec-shippability-review/tests/expected/<name>.json
//
// The fixtures use docs/specs/ as their virtual location — but to keep tests
// isolated, each test copies the fixture to a tmp project dir's docs/specs/
// and invokes check.mjs with --project-root pointing at the tmp dir. This
// keeps the real docs/specs/ untouched and avoids any cross-test state.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, copyFile, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');
const CHECK_MJS = join(repoRoot, '.claude/skills/spec-shippability-review/check.mjs');
const FIXTURES_DIR = join(repoRoot, '.claude/skills/spec-shippability-review/tests/fixtures');
const EXPECTED_DIR = join(repoRoot, '.claude/skills/spec-shippability-review/tests/expected');

async function setupProject(fixtureName, slug) {
  const tmp = await mkdtemp(join(tmpdir(), 'spec-ship-'));
  await mkdir(join(tmp, 'docs/specs'), { recursive: true });
  await copyFile(join(FIXTURES_DIR, `${fixtureName}.md`), join(tmp, 'docs/specs', `${slug}.md`));

  // Copy the real shipped manifest so C3 has real data to compare against.
  // The fixtures don't trip C3 (it's covered by C1's overlap); this just
  // ensures C3 doesn't false-positive when the manifest is empty.
  await mkdir(join(tmp, 'obj/template/.claude'), { recursive: true });
  const realManifest = join(repoRoot, 'obj/template/.claude/manifest.json');
  if (existsSync(realManifest)) {
    await copyFile(realManifest, join(tmp, 'obj/template/.claude/manifest.json'));
  }

  // For the advisory-mixed fixture: sweep.py must EXIST on disk for the
  // ADVISORY (vs BLOCKER) verdict. Create a stub.
  if (fixtureName === 'advisory-mixed') {
    await mkdir(join(tmp, '.claude/skills/memory-flush'), { recursive: true });
    await writeFile(join(tmp, '.claude/skills/memory-flush/sweep.py'), '# stub for test fixture\n');
  }

  return tmp;
}

function runChecker(projectRoot, slug) {
  const result = spawnSync('node', [CHECK_MJS, slug, '--project-root', projectRoot], {
    encoding: 'utf8',
  });
  let report = null;
  const reportPath = join(projectRoot, '.claude/state/spec-shippability', `${slug}.json`);
  if (existsSync(reportPath)) {
    report = JSON.parse(require('node:fs').readFileSync(reportPath, 'utf8'));
  }
  return { exitCode: result.status, stdout: result.stdout, stderr: result.stderr, report };
}

async function runCheckerAsync(projectRoot, slug) {
  const result = spawnSync('node', [CHECK_MJS, slug, '--project-root', projectRoot], {
    encoding: 'utf8',
  });
  const reportPath = join(projectRoot, '.claude/state/spec-shippability', `${slug}.json`);
  let report = null;
  if (existsSync(reportPath)) {
    report = JSON.parse(await readFile(reportPath, 'utf8'));
  }
  return { exitCode: result.status, stdout: result.stdout, stderr: result.stderr, report };
}

async function loadExpected(fixtureName) {
  return JSON.parse(await readFile(join(EXPECTED_DIR, `${fixtureName}.json`), 'utf8'));
}

function assertExpectedShape(report, expected, label) {
  assert.equal(report.verdict, expected.verdict,
    `${label}: verdict must be ${expected.verdict}; got ${report.verdict}`);
  assert.equal(report.findings.length, expected.expected_finding_count,
    `${label}: expected ${expected.expected_finding_count} findings; got ${report.findings.length}`);
  for (const exp of expected.expected_checks) {
    const match = report.findings.find((f) =>
      f.check === exp.check &&
      f.severity === exp.severity &&
      (f.evidence ?? '').includes(exp.evidence_contains)
    );
    assert.ok(match,
      `${label}: expected a ${exp.severity} ${exp.check} finding with evidence containing "${exp.evidence_contains}"; got findings: ${JSON.stringify(report.findings.map(f => ({check: f.check, severity: f.severity, evidence: f.evidence})))}`);
  }
}

function verdictToExpectedExit(verdict) {
  return verdict === 'BLOCKED' ? 2 : verdict === 'NEEDS_REVIEW' ? 1 : 0;
}

describe('spec-shippability-review — fixture suite', () => {
  for (const fixtureName of ['clean', 'blocker-dev-import', 'blocker-python', 'advisory-mixed']) {
    it(`test_when_check_runs_on_${fixtureName}_then_verdict_and_findings_match_expected`, async () => {
      const slug = `fixture-${fixtureName}`;
      const projectRoot = await setupProject(fixtureName, slug);
      const expected = await loadExpected(fixtureName);

      const { exitCode, report } = await runCheckerAsync(projectRoot, slug);

      assert.ok(report, `report file must exist at .claude/state/spec-shippability/${slug}.json`);
      assertExpectedShape(report, expected, fixtureName);
      assert.equal(exitCode, verdictToExpectedExit(expected.verdict),
        `${fixtureName}: exit code must encode verdict (0=CLEAN, 1=NEEDS_REVIEW, 2=BLOCKED)`);
    });
  }
});

describe('spec-shippability-review — error paths', () => {
  it('test_when_slug_arg_missing_then_exits_2_with_usage', () => {
    const result = spawnSync('node', [CHECK_MJS], { encoding: 'utf8' });
    assert.equal(result.status, 2);
    assert.match(result.stderr, /usage:/);
  });

  it('test_when_spec_missing_then_BLOCKED_with_SPEC_MISSING_finding', async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), 'spec-ship-missing-'));
    const { exitCode, report } = await runCheckerAsync(projectRoot, 'nonexistent');
    assert.equal(exitCode, 2);
    assert.equal(report.verdict, 'BLOCKED');
    assert.ok(report.findings.some((f) => f.check === 'SPEC_MISSING'));
  });
});
