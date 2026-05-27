// Scanner hardening — scan-shipped-skills.mjs walks more than just SKILL.md
// shell fences:
//
//   1. Shipped helper files (*.mjs, *.js, *.sh, *.py) under skill dirs are
//      walked; runtime invocation patterns (import / require / node -e / node
//      <file>) referencing dev-only paths (src/, tests/, scripts/, obj/) emit
//      DEV_TREE_RUNTIME_REF BLOCKERS — closes the seed-tasklist.mjs leak.
//
//   2. Inline backticks inside *.md files are inspected in addition to
//      ```bash / ```sh / ```shell fences — closes the harness/SKILL.md line 59
//      leak (inline `node -e "import('./src/cli/workflow-migrator.js')..."`).
//
// Tests are RED until /implement extends analyzer.mjs + scan-shipped-skills.mjs.
// The fence-regression + clean-helper tests are REGRESSION_TRAP_PRE_PASSING
// (memory entry #43): they defend existing/expected-stable behavior; today's
// scanner already produces these verdicts trivially because helper files
// aren't walked at all yet.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(here, '..');
const SCANNER = join(REPO_ROOT, '.claude/skills/spec-shippability-review/scan-shipped-skills.mjs');
const FIXTURES_DIR = join(REPO_ROOT, '.claude/skills/spec-shippability-review/tests/fixtures');

const MINIMAL_SKILL_MD = '---\nname: planted\nowner: baseline\ndescription: fixture skill\n---\n\nFixture skill, no procedure.\n';

async function makeProject(slug, files) {
  const project = await mkdtemp(join(tmpdir(), `scan-hardened-${slug}-`));
  const skillDir = join(project, '.claude/skills/planted');
  await mkdir(skillDir, { recursive: true });
  await writeFile(join(skillDir, 'SKILL.md'), MINIMAL_SKILL_MD);
  for (const [name, action] of files) {
    let content;
    if (typeof action === 'string') {
      content = await readFile(join(FIXTURES_DIR, action), 'utf8');
    } else if (typeof action === 'object' && action.content !== undefined) {
      content = action.content;
    } else {
      continue;
    }
    if (name === 'SKILL.md' && !/^---\n[\s\S]*?\nowner:\s+baseline[\s\S]*?\n---\n/.test(content)) {
      content = MINIMAL_SKILL_MD + '\n' + content;
    }
    await writeFile(join(skillDir, name), content);
  }
  await mkdir(join(project, 'obj/template/.claude'), { recursive: true });
  await writeFile(
    join(project, 'obj/template/.claude/manifest.json'),
    JSON.stringify({ files: {} }, null, 2),
  );
  return project;
}

function runScanner(project) {
  const result = spawnSync(
    'node',
    [SCANNER, '--root', join(project, '.claude/skills'), '--report-root', project],
    { encoding: 'utf8', cwd: project },
  );
  let report = null;
  const reportPath = join(project, '.claude/state/spec-shippability/shipped-skills.json');
  if (existsSync(reportPath)) {
    report = JSON.parse(readFileSync(reportPath, 'utf8'));
  }
  return { exitCode: result.status, stdout: result.stdout, stderr: result.stderr, report };
}

async function cleanup(project) {
  await rm(project, { recursive: true, force: true });
}

describe('scan-shipped-skills.mjs — helper-file walk', () => {
  it('test_when_shipped_helper_imports_dev_tree_path_then_scanner_emits_blocker', async () => {
    const project = await makeProject('helper-import', [
      ['helper.mjs', 'blocker-helper-import.mjs'],
    ]);
    try {
      const { exitCode, report, stdout, stderr } = runScanner(project);
      assert.equal(
        exitCode,
        2,
        `scanner must exit 2 (BLOCKED) when a shipped .mjs helper imports from src/cli/.\n` +
          `Got exitCode=${exitCode}\nstdout=${stdout}\nstderr=${stderr}\n` +
          `report.findings=${JSON.stringify(report?.findings, null, 2)}`,
      );
      assert.ok(report, 'scanner must write a report at .claude/state/spec-shippability/shipped-skills.json');
      assert.equal(report.verdict, 'BLOCKED');
      const blocker = report.findings.find(
        (f) => f.severity === 'BLOCKER' && f.check === 'DEV_TREE_RUNTIME_REF'
          && (f.evidence?.includes('src/cli/workflows-validator.js')
              || f.evidence?.includes('src/cli/track-tasklist-materializer.js')),
      );
      assert.ok(
        blocker,
        `expected a BLOCKER DEV_TREE_RUNTIME_REF finding citing src/cli/. ` +
          `findings: ${JSON.stringify(report.findings, null, 2)}`,
      );
      assert.match(
        blocker.file,
        /helper\.mjs$/,
        `finding.file must point at the helper.mjs we planted; got: ${blocker.file}`,
      );
    } finally {
      await cleanup(project);
    }
  });

  it('test_when_clean_helper_with_only_local_imports_then_scanner_clean', async () => {
    const project = await makeProject('clean-helper', [
      ['helper.mjs', 'clean-helper.mjs'],
      ['neighbor.js', { content: 'export function neighborUtil(x) { return x; }\n' }],
    ]);
    try {
      const { exitCode, report } = runScanner(project);
      assert.equal(
        exitCode,
        0,
        `scanner must exit 0 (CLEAN) for a helper that imports only from node:* and sibling paths.\n` +
          `Got exitCode=${exitCode}\n` +
          `report.findings=${JSON.stringify(report?.findings, null, 2)}`,
      );
      assert.equal(report.verdict, 'CLEAN');
      assert.equal(report.findings.length, 0, 'CLEAN report must have zero findings');
    } finally {
      await cleanup(project);
    }
  });
});

describe('scan-shipped-skills.mjs — inline backtick detection in *.md', () => {
  it('test_when_inline_backtick_in_md_references_dev_tree_then_scanner_emits_blocker', async () => {
    const project = await makeProject('inline-backtick', [
      ['SKILL.md', 'blocker-inline-backtick.md'],
    ]);
    try {
      const { exitCode, report, stdout, stderr } = runScanner(project);
      assert.equal(
        exitCode,
        2,
        `scanner must exit 2 when a *.md has dev-tree refs inside inline backticks.\n` +
          `Got exitCode=${exitCode}\nstdout=${stdout}\nstderr=${stderr}\n` +
          `report.findings=${JSON.stringify(report?.findings, null, 2)}`,
      );
      assert.ok(report);
      assert.equal(report.verdict, 'BLOCKED');
      const migratorRef = report.findings.find(
        (f) => f.severity === 'BLOCKER' && f.evidence?.includes('src/cli/workflow-migrator.js'),
      );
      assert.ok(
        migratorRef,
        `expected a BLOCKER citing src/cli/workflow-migrator.js (the inline-backtick example). ` +
          `findings: ${JSON.stringify(report.findings, null, 2)}`,
      );
    } finally {
      await cleanup(project);
    }
  });

  it('test_when_shell_fence_references_dev_tree_then_scanner_still_emits_blocker', async () => {
    // Regression trap (REGRESSION_TRAP_PRE_PASSING): the existing fence-based
    // detection MUST keep working after analyzer.mjs is extended. The fixture
    // is the same v0.8.1-shaped blocker-dev-import.md that tests/spec-
    // shippability-review.test.mjs already covers; this test runs it through
    // scan-shipped-skills.mjs (the aggregate scanner) instead of check.mjs.
    const project = await makeProject('fence-regression', [
      ['SKILL.md', 'blocker-dev-import.md'],
    ]);
    try {
      const { exitCode, report } = runScanner(project);
      assert.equal(
        exitCode,
        2,
        `scanner must continue to exit 2 on shell-fence dev-tree refs after analyzer extension.\n` +
          `Got exitCode=${exitCode}\n` +
          `report.findings=${JSON.stringify(report?.findings, null, 2)}`,
      );
      assert.equal(report.verdict, 'BLOCKED');
      const fenceFinding = report.findings.find(
        (f) => f.check === 'DEV_TREE_RUNTIME_REF' && f.evidence?.includes('reconciliation-marker.js'),
      );
      assert.ok(
        fenceFinding,
        `existing fence-based DEV_TREE_RUNTIME_REF detection must still fire on reconciliation-marker.js.\n` +
          `findings: ${JSON.stringify(report.findings, null, 2)}`,
      );
    } finally {
      await cleanup(project);
    }
  });
});
