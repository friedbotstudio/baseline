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
const SPEC_GUARD = join(REPO_ROOT, '.claude/hooks/direction_approval_guard.mjs');
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

// --- fan-out verdict read-path (RELOCATED by gate-collapse D3/CO-E, D-6) ------
// The BLOCKED fan-out cross-check formerly lived in the approval guard at
// token-write. With the direction gate firing at intake (before the checker
// fan-out has run), that check moved to the harness pre-implementation-gate.
// The spec-rollout AC-007 intent — a BLOCKED rollout-enforceability verdict must
// stop the build — is preserved, now enforced downstream at implementation entry.

function buildGuardSandbox() {
  const root = tmpRoot('specg-');
  mkdirSync(join(root, '.claude/hooks/lib'), { recursive: true });
  mkdirSync(join(root, '.claude/state/spec_approvals'), { recursive: true });
  mkdirSync(join(root, '.claude/state/checker-fanout'), { recursive: true });
  cpSync(SPEC_GUARD, join(root, '.claude/hooks/direction_approval_guard.mjs'));
  cpSync(LIB_DIR, join(root, '.claude/hooks/lib'), { recursive: true });
  writeFileSync(
    join(root, '.claude/project.json'),
    JSON.stringify({ configured: true, consent: { gate_marker_ttl_seconds: 120 } }, null, 2),
  );
  // Fresh, slug-matched direction consent marker: line 1 = slug, line 2 = epoch.
  const now = Math.floor(Date.now() / 1000);
  writeFileSync(join(root, '.claude/state/.direction_approval_grant'), `${SLUG}\n${now}\n`);
  // A BLOCKED fan-out verdict on disk — the direction guard must IGNORE it now.
  writeFileSync(
    join(root, '.claude/state/checker-fanout', `${SLUG}.json`),
    JSON.stringify({ verdict: 'BLOCKED', findings: [{ checker: 'spec-rollout', check: 'missing_enforced_by', severity: 'BLOCKER', message: 'unbound prerequisite' }] }),
  );
  return root;
}

function runGuard(root) {
  const payload = {
    tool_name: 'Write',
    tool_input: {
      file_path: join(root, '.claude/state/spec_approvals', `${SLUG}.approval`),
      content: 'APPROVED\n1700000000\n/abs/intake.md\nN/A\n',
    },
  };
  const res = spawnSync('node', [join(root, '.claude/hooks/direction_approval_guard.mjs')], {
    input: JSON.stringify(payload),
    env: { ...process.env, CLAUDE_PROJECT_DIR: root },
    encoding: 'utf8',
  });
  return { denied: res.stdout.includes('"permissionDecision":"deny"'), stdout: res.stdout };
}

describe('direction_approval_guard — fan-out check relocated (gate-collapse D-6)', () => {
  it('test_when_direction_guard_sees_blocked_fanout_then_allows_relocated', () => {
    // The token is written at intake; the fan-out verdict is not the guard's
    // concern anymore (moved to pre-implementation-gate). Guard ALLOWS.
    const root = buildGuardSandbox();
    const { denied } = runGuard(root);
    assert.equal(denied, false, 'direction guard no longer blocks on the fan-out verdict (relocated to pre-implementation-gate)');
  });

  it('test_when_pre_implementation_gate_reads_blocked_fanout_then_not_ready', async () => {
    // The relocated enforcement point preserves spec-rollout AC-007.
    const root = buildGuardSandbox();
    const { checkImplementationReady } = await import(join(REPO_ROOT, '.claude/skills/harness/pre-implementation-gate.mjs'));
    const r = checkImplementationReady({ slug: SLUG, rootDir: root });
    assert.equal(r.ready, false, 'BLOCKED fan-out verdict stops implementation at the pre-implementation gate');
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
