// spec-rollout-enforceability — integration: fan-out registration + verdict
// persistence (AC-008), the approval-guard read-path (AC-007), and the structural
// format/CI surfaces (AC-001, AC-009). Guard tests mirror the sandbox style of
// tests/epic-approval-guard.test.mjs (temp CLAUDE_PROJECT_DIR, spawnSync, stdin).

import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, cpSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { DEFAULT_CHECKER_REGISTRY, runCheckerFanout } from '../.claude/skills/harness/checker-fanout.mjs';

const REPO_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const SPEC_GUARD = join(REPO_ROOT, '.claude/hooks/spec_approval_guard.mjs');
const LIB_DIR = join(REPO_ROOT, '.claude/hooks/lib');
const SLUG = 'demo-slug';
const SANDBOXES = [];

after(() => { for (const d of SANDBOXES) { try { rmSync(d, { recursive: true, force: true }); } catch {} } });

function tmpRoot(prefix) {
  const root = mkdtempSync(join(tmpdir(), prefix));
  SANDBOXES.push(root);
  return root;
}

describe('checker-fanout — spec-rollout registration + verdict persistence', () => {
  it('test_when_fanout_registry_then_spec_rollout_present', () => {
    assert.ok(
      Object.prototype.hasOwnProperty.call(DEFAULT_CHECKER_REGISTRY, 'spec-rollout'),
      'DEFAULT_CHECKER_REGISTRY must register a spec-rollout adapter',
    );
    // A registry entry is a phase-tagged { phase, run } object (or a legacy bare function);
    // either way its run must be callable.
    const entry = DEFAULT_CHECKER_REGISTRY['spec-rollout'];
    const run = typeof entry === 'function' ? entry : entry.run;
    assert.equal(typeof run, 'function');
  });

  it('test_when_fanout_runs_then_merged_verdict_persisted', async () => {
    const root = tmpRoot('fanout-');
    mkdirSync(join(root, 'docs/specs'), { recursive: true });
    writeFileSync(join(root, `docs/specs/${SLUG}.md`), '# spec\n## Rollout\n');
    const result = await runCheckerFanout({
      slug: SLUG,
      rootDir: root,
      enabled: true,
      registry: { 'spec-rollout': () => ({ findings: [] }) },
    });
    assert.equal(result.verdict, 'CLEAN');
    const verdictPath = join(root, '.claude/state/checker-fanout', `${SLUG}.json`);
    assert.ok(existsSync(verdictPath), 'merged verdict must be persisted for the guard to read');
    const persisted = JSON.parse(readFileSync(verdictPath, 'utf8'));
    assert.equal(persisted.verdict, 'CLEAN');
    assert.ok(Array.isArray(persisted.findings));
  });
});

// --- spec_approval_guard fan-out verdict read-path ---------------------------

function buildGuardSandbox({ verdict }) {
  const root = tmpRoot('specg-');
  mkdirSync(join(root, '.claude/hooks/lib'), { recursive: true });
  mkdirSync(join(root, '.claude/state/spec_approvals'), { recursive: true });
  mkdirSync(join(root, '.claude/state/checker-fanout'), { recursive: true });
  cpSync(SPEC_GUARD, join(root, '.claude/hooks/spec_approval_guard.mjs'));
  cpSync(LIB_DIR, join(root, '.claude/hooks/lib'), { recursive: true });
  writeFileSync(
    join(root, '.claude/project.json'),
    JSON.stringify({ configured: true, consent: { gate_marker_ttl_seconds: 120 } }, null, 2),
  );
  // Fresh, slug-matched consent marker: line 1 = slug, line 2 = epoch.
  const now = Math.floor(Date.now() / 1000);
  writeFileSync(join(root, '.claude/state/.spec_approval_grant'), `${SLUG}\n${now}\n`);
  if (verdict) {
    writeFileSync(
      join(root, '.claude/state/checker-fanout', `${SLUG}.json`),
      JSON.stringify({ verdict, findings: verdict === 'BLOCKED'
        ? [{ checker: 'spec-rollout', check: 'missing_enforced_by', severity: 'BLOCKER', message: 'unbound prerequisite' }]
        : [] }),
    );
  }
  return root;
}

function runGuard(root) {
  const payload = {
    tool_name: 'Write',
    tool_input: {
      file_path: join(root, '.claude/state/spec_approvals', `${SLUG}.approval`),
      content: 'APPROVED\n1700000000\n/abs/spec.md\nN/A\n',
    },
  };
  const res = spawnSync('node', [join(root, '.claude/hooks/spec_approval_guard.mjs')], {
    input: JSON.stringify(payload),
    env: { ...process.env, CLAUDE_PROJECT_DIR: root },
    encoding: 'utf8',
  });
  return { denied: res.stdout.includes('"permissionDecision":"deny"'), stdout: res.stdout };
}

describe('spec_approval_guard — fan-out verdict gate (AC-007)', () => {
  it('test_when_guard_reads_blocked_fanout_verdict_then_deny', () => {
    const root = buildGuardSandbox({ verdict: 'BLOCKED' });
    const { denied } = runGuard(root);
    assert.ok(denied, 'a BLOCKED fan-out verdict must deny the approval token write');
  });

  it('test_when_guard_fanout_verdict_absent_then_allow', () => {
    const root = buildGuardSandbox({ verdict: null }); // no verdict file
    const { denied } = runGuard(root);
    assert.equal(denied, false, 'absent fan-out verdict is fail-safe: ALLOW');
  });
});

// --- structural surfaces -----------------------------------------------------

describe('format + CI surfaces', () => {
  it('test_when_template_has_structured_prereq_and_kind_column', () => {
    const tmpl = readFileSync(join(REPO_ROOT, '.claude/skills/spec/template.md'), 'utf8');
    assert.match(tmpl, /###\s+Prerequisites/, 'Rollout must define a ### Prerequisites table');
    assert.match(tmpl, /enforced-by/, 'Prerequisites table must have an enforced-by column');
    const acSection = tmpl.slice(tmpl.indexOf('## Acceptance criteria'));
    assert.match(acSection, /\bKind\b/, 'AC table must carry a Kind column');
  });

  it('test_when_release_yml_has_pages_preflight', () => {
    const yml = readFileSync(join(REPO_ROOT, '.github/workflows/release.yml'), 'utf8');
    assert.match(yml, /build_type/, 'release.yml must reference Pages build_type');
    assert.match(yml, /gh api[^\n]*pages/i, 'preflight must query the Pages API via gh');
    assert.match(yml, /workflow/, 'preflight must assert build_type == workflow');
  });
});
