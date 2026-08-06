// Scenarios for the audit-flake-writer-isolation landing.
//
// Background: `npm test` intermittently reports exactly 3 failures, always the
// tests that spawn `.claude/skills/audit-baseline/audit.mjs` against the LIVE
// repo and assert exit 0 (backlog:
// full-suite-intermittently-fails-three-audit-spawning-tests). Each passes in
// isolation. The audit reads exactly two live build trees — `obj/template/`
// (checks/context.mjs loadManifest) and `obj/site/` (checks/docsite-drift.mjs) —
// and the default test tier rewrites BOTH while sibling tests read them. That is
// the writer-vs-parallel-reader race the landmine
// `live-objtemplate-rebuild-races-parallel-test-readers` already names; the
// 2026-06-05 structural guard (tests/no-live-objtemplate-reads.test.mjs) misses
// these two writers.
//
// This file covers the two new test helpers and the one shipped-skill change.
// The guard's own detector self-checks live in the guard file, next to the
// detector they exercise.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readdir, stat } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// The helpers under test do not exist yet. Guard the imports so the file fails
// with one clear message instead of a cryptic loader error (scenario MEMORY.md:
// "guard the import with try/catch at module top level").
let runRepoAudit;
let buildSiteIsolated;
let docsiteDriftRun;
let deriveNames;
try {
  ({ runRepoAudit } = await import('./helpers/audit-repo.mjs'));
  ({ buildSiteIsolated } = await import('./helpers/site-build.mjs'));
  ({ run: docsiteDriftRun } = await import(
    '../.claude/skills/audit-baseline/checks/docsite-drift.mjs'
  ));
  ({ deriveNames } = await import('../.claude/skills/audit-baseline/derive-counts.mjs'));
} catch (err) {
  throw new Error(
    `audit-flake-writer-isolation scenarios need tests/helpers/audit-repo.mjs and ` +
      `tests/helpers/site-build.mjs (plus the audit-baseline checks they assert on). ` +
      `Import failed: ${err.message}`,
  );
}

// Foundation: a stub "audit" whose exit code and output the test dictates, so the
// capture path is exercised without needing a real audit failure — which is
// precisely the thing that cannot be summoned on demand.
async function makeStubAudit({ exitCode, stdout, stderr }) {
  const dir = await mkdtemp(join(tmpdir(), 'audit-capture-'));
  const script = join(dir, 'stub-audit.mjs');
  await writeFile(
    script,
    `process.stdout.write(${JSON.stringify(stdout)});\n` +
      `process.stderr.write(${JSON.stringify(stderr)});\n` +
      `process.exit(${exitCode});\n`,
  );
  return { dir, script };
}

const FAIL_ROWS =
  'check                 status  detail\n' +
  'docsite: skills/index.html lists every skill  FAIL    missing: standup, workspace\n' +
  'overall               FAIL    fails=1 warns=0\n';

describe('audit capture helper — the audit\'s own complaint survives a failing run', () => {
  it('test_when_repo_audit_fails_then_helper_captures_stdout_and_stderr', async () => {
    const { dir, script } = await makeStubAudit({
      exitCode: 1,
      stdout: FAIL_ROWS,
      stderr: 'stderr marker: context build threw\n',
    });
    const logDir = join(dir, 'logs');

    await assert.rejects(
      async () =>
        runRepoAudit({
          label: 'capture-probe',
          command: process.execPath,
          args: [script],
          cwd: dir,
          logDir,
        }),
      (err) => {
        assert.match(
          err.message,
          /docsite: skills\/index\.html lists every skill\s+FAIL/,
          'the thrown error must carry the audit FAIL rows, not a truncated payload',
        );
        assert.match(
          err.message,
          /audit-failure-capture-probe\.log/,
          'the thrown error must name the capture log path',
        );
        return true;
      },
    );

    const logPath = join(logDir, 'audit-failure-capture-probe.log');
    assert.ok(existsSync(logPath), 'a capture log must be written on failure');
    const captured = readFileSync(logPath, 'utf8');
    assert.ok(
      captured.includes('missing: standup, workspace'),
      'the capture log must contain the full stdout',
    );
    assert.ok(
      captured.includes('stderr marker: context build threw'),
      'the capture log must contain stderr too — the backlog entry names it as the missing evidence',
    );
  });

  it('test_when_repo_audit_passes_then_no_capture_log_is_written', async () => {
    const { dir, script } = await makeStubAudit({
      exitCode: 0,
      stdout: 'overall               PASS    fails=0 warns=0\n',
      stderr: '',
    });
    const logDir = join(dir, 'logs');

    const out = await runRepoAudit({
      label: 'green-probe',
      command: process.execPath,
      args: [script],
      cwd: dir,
      logDir,
    });

    assert.match(out, /overall\s+PASS/, 'the green path returns the audit stdout');
    const entries = existsSync(logDir) ? await readdir(logDir) : [];
    assert.deepEqual(
      entries.filter((n) => n.startsWith('audit-failure-')),
      [],
      'the green path must leave no capture log behind',
    );
  });
});

describe('isolated site build — the default tier stops rewriting the live obj/site', () => {
  it('test_when_isolated_site_build_runs_then_live_obj_site_is_not_written', async () => {
    const liveIndex = join(REPO_ROOT, 'obj/site/index.html');
    const before = existsSync(liveIndex) ? (await stat(liveIndex)).mtimeMs : null;

    const { outDir } = await buildSiteIsolated('scenario-isolation');

    assert.notEqual(outDir, join(REPO_ROOT, 'obj/site'), 'the build must not target the live tree');
    assert.ok(
      existsSync(join(outDir, 'index.html')),
      'the isolated build must produce its own index.html',
    );

    const after = existsSync(liveIndex) ? (await stat(liveIndex)).mtimeMs : null;
    assert.equal(
      after,
      before,
      'the live obj/site/index.html must be untouched — that file is what checks/docsite-drift.mjs reads',
    );
  });
});

describe('docsite drift — a stale site says how to refresh it', () => {
  it('test_when_docsite_page_is_stale_then_fail_detail_names_the_rebuild_command', () => {
    const names = deriveNames(REPO_ROOT);
    const rendered = (list) => `<html><body>${list.join(' ')}</body></html>`;
    // The skills page renders nothing, so every skill name is missing: an
    // unambiguous FAIL that no substring collision can soften.
    const pages = {
      'obj/site/index.html': '<html><body>site</body></html>',
      'obj/site/hooks/index.html': rendered(names.hooks),
      'obj/site/workflows/index.html': rendered(names.tracks.canonical),
      'obj/site/skills/index.html': '<html><body>stale</body></html>',
      'obj/site/mcp/index.html': rendered(names.mcpServers),
    };
    const ctx = { root: REPO_ROOT, readText: (rel) => pages[rel] ?? '' };

    const rows = docsiteDriftRun(ctx);
    const skillsRow = rows.find(([name]) => name.includes('skills/index.html'));

    assert.ok(skillsRow, 'the skills page must be reported');
    assert.equal(skillsRow[1], 'FAIL', 'a page missing every skill name is drift, not a skip');
    assert.match(
      skillsRow[2],
      /npm run build:site/,
      'the FAIL detail must name the rebuild command — once the site tests stop ' +
        'incidentally refreshing obj/site, a stale site is the likely cause and the ' +
        'SKIP branch already sets this precedent',
    );
  });
});
