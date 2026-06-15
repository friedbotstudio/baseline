// Tests for the git workflow-topology enforcement in git_commit_guard.mjs.
// Spec: docs/specs/git-workflow-topology-model.md (§Behavior #1-#6, #8 partial).
//
// Drives git_commit_guard.mjs via spawnSync with synthetic stdin payloads, in a
// temp CLAUDE_PROJECT_DIR (NOT this repo's live dir) so config + git state are
// isolated. Topology logic lives in git_commit_guard.mjs + hooks/lib/common.mjs;
// both are copied into each sandbox.
//
// Coverage map (one or more tests per criterion):
//   AC-001 model resolution; AC-002 direct-to-main blocks off-release;
//   AC-003 direct-to-main passes on-release; AC-004 github-flow blocks default;
//   AC-005 github-flow passes feature branch; AC-006 ask passes (no prompt);
//   AC-007 reserved gitflow/trunk -> ask; AC-008 worktree carve-out;
//   AC-009 topology PASS composes with consent; AC-010 detached precedes topology;
//   AC-012 audit obligations (hooks==22, Article VII present, mirror byte-equal);
//   AC-013 this-repo migration (worktree commit + release-branch commit pass).
// AC-011 (detection classifier) is unit-tested in git-workflow-model-detect.test.mjs.

import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, cpSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const GUARD = join(REPO_ROOT, '.claude/hooks/git_commit_guard.mjs');
const LIB   = join(REPO_ROOT, '.claude/hooks/lib/common.mjs');
const CLOSURE = join(REPO_ROOT, '.claude/hooks/lib/closure-check.mjs');

const SANDBOXES = [];

// Build a temp CLAUDE_PROJECT_DIR with copies of the guard + lib, a writable
// project.json, a state dir, and an initialized git repo on `main` with a seed
// commit (so HEAD is born — detached != unborn).
function buildSandbox(projectJson) {
  const root = mkdtempSync(join(tmpdir(), 'gtopo-'));
  mkdirSync(join(root, '.claude/hooks/lib'), { recursive: true });
  mkdirSync(join(root, '.claude/state/logs'), { recursive: true });
  cpSync(LIB, join(root, '.claude/hooks/lib/common.mjs'));
  cpSync(CLOSURE, join(root, '.claude/hooks/lib/closure-check.mjs'));
  cpSync(GUARD, join(root, '.claude/hooks/git_commit_guard.mjs'));
  writeFileSync(join(root, '.claude/project.json'), JSON.stringify(projectJson, null, 2));
  spawnSync('git', ['init', '-q', '-b', 'main', root], { stdio: 'ignore' });
  spawnSync('git', ['-C', root, '-c', 'user.email=test@test', '-c', 'user.name=Test',
                    'commit', '--allow-empty', '-q', '-m', 'seed', '--no-gpg-sign'], { stdio: 'ignore' });
  SANDBOXES.push(root);
  return root;
}

function setBranch(root, branchName) {
  spawnSync('git', ['-C', root, 'checkout', '-q', '-B', branchName], { stdio: 'ignore' });
}

function detach(root) {
  const sha = spawnSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).stdout.trim();
  spawnSync('git', ['-C', root, 'checkout', '-q', '--detach', sha], { stdio: 'ignore' });
}

function writeConsent(root, name, epoch) {
  writeFileSync(join(root, '.claude/state', name), `${epoch}\n`);
}

// Add a linked worktree of `root` checked out on `branch`, seed it with a
// project.json + the hooks so the guard run with CLAUDE_PROJECT_DIR=<wt> reads
// the same config and detects the linked-worktree git-dir. Returns the wt path.
function addWorktree(root, branch, projectJson) {
  const wt = mkdtempSync(join(tmpdir(), 'gtopo-wt-'));
  rmSync(wt, { recursive: true, force: true }); // git worktree add wants a non-existent path
  const r = spawnSync('git', ['-C', root, 'worktree', 'add', '-q', '-b', branch, wt, 'HEAD'], { encoding: 'utf8' });
  assert.equal(r.status, 0, `git worktree add failed: ${r.stderr}`);
  mkdirSync(join(wt, '.claude/hooks/lib'), { recursive: true });
  mkdirSync(join(wt, '.claude/state/logs'), { recursive: true });
  cpSync(LIB, join(wt, '.claude/hooks/lib/common.mjs'));
  cpSync(CLOSURE, join(wt, '.claude/hooks/lib/closure-check.mjs'));
  cpSync(GUARD, join(wt, '.claude/hooks/git_commit_guard.mjs'));
  writeFileSync(join(wt, '.claude/project.json'), JSON.stringify(projectJson, null, 2));
  SANDBOXES.push(wt);
  return wt;
}

// Run the guard with a Bash payload; return { decision, reason, code }.
function runGuard(projectDir, payload, scriptRoot = projectDir) {
  const res = spawnSync('node', [join(scriptRoot, '.claude/hooks/git_commit_guard.mjs')], {
    input: JSON.stringify(payload),
    encoding: 'utf8',
    env: { ...process.env, CLAUDE_PROJECT_DIR: projectDir },
  });
  let decision = 'allow', reason = '';
  try {
    const parsed = JSON.parse(res.stdout || '{}');
    decision = parsed?.hookSpecificOutput?.permissionDecision || 'allow';
    reason = parsed?.hookSpecificOutput?.permissionDecisionReason || '';
  } catch { /* no JSON => allow */ }
  return { decision, reason, code: res.status };
}

const commit = { tool_name: 'Bash', tool_input: { command: 'git commit -m test' } };

after(() => {
  // Prune worktrees first, then remove sandbox dirs.
  for (const r of SANDBOXES) {
    spawnSync('git', ['-C', r, 'worktree', 'prune'], { stdio: 'ignore' });
  }
  for (const r of SANDBOXES) {
    try { rmSync(r, { recursive: true, force: true }); } catch { /* best-effort */ }
  }
});

describe('§Behavior #2 — direct-to-main enforcement', () => {
  it('test_when_direct_to_main_on_feature_branch_primary_tree_then_block', () => {
    const root = buildSandbox({ consent: {}, git: { workflow_model: 'direct-to-main', release_branches: ['main'], protected_branches: [], branch_pattern: null } });
    setBranch(root, 'feat/x');
    const r = runGuard(root, commit);
    assert.equal(r.decision, 'deny', `expected topology deny; got ${r.decision} reason=${r.reason}`);
    assert.match(r.reason, /merge --ff-only feat\/x/, 'remediation should name git merge --ff-only <branch>');
  });

  it('test_when_direct_to_main_on_release_branch_main_then_pass', () => {
    const root = buildSandbox({ consent: {}, git: { workflow_model: 'direct-to-main', release_branches: ['main'], protected_branches: [], branch_pattern: null } });
    setBranch(root, 'main');
    const r = runGuard(root, commit);
    assert.equal(r.decision, 'allow', `expected topology pass on release branch; got ${r.decision} reason=${r.reason}`);
  });

  it('test_when_direct_to_main_on_next_in_release_list_then_pass', () => {
    const root = buildSandbox({ consent: {}, git: { workflow_model: 'direct-to-main', release_branches: ['main', 'next'], protected_branches: [], branch_pattern: null } });
    setBranch(root, 'next');
    const r = runGuard(root, commit);
    assert.equal(r.decision, 'allow', `expected pass on next (in release list); got ${r.decision} reason=${r.reason}`);
  });

  it('test_when_direct_to_main_release_branches_absent_then_defaults_to_main', () => {
    const root = buildSandbox({ consent: {}, git: { workflow_model: 'direct-to-main', protected_branches: [], branch_pattern: null } });
    setBranch(root, 'feat/y');
    const r = runGuard(root, commit);
    assert.equal(r.decision, 'deny', `expected deny (default release set [main], feat/y not in it); got ${r.decision} reason=${r.reason}`);
  });
});

describe('§Behavior #3 — github-flow enforcement', () => {
  it('test_when_github_flow_on_default_branch_then_block', () => {
    const root = buildSandbox({ consent: {}, git: { workflow_model: 'github-flow', release_branches: ['main'], protected_branches: [], branch_pattern: null } });
    setBranch(root, 'main');
    const r = runGuard(root, commit);
    assert.equal(r.decision, 'deny', `expected github-flow deny on main; got ${r.decision} reason=${r.reason}`);
    assert.match(r.reason, /feature branch/i, 'reason should tell the user to create a feature branch');
  });

  it('test_when_github_flow_on_feature_branch_then_pass', () => {
    const root = buildSandbox({ consent: {}, git: { workflow_model: 'github-flow', release_branches: ['main'], protected_branches: [], branch_pattern: null } });
    setBranch(root, 'feat/x');
    const r = runGuard(root, commit);
    assert.equal(r.decision, 'allow', `expected pass on feature branch; got ${r.decision} reason=${r.reason}`);
  });
});

describe('§Behavior #4 — ask: guard passes (no prompt), reserved values resolve to ask', () => {
  for (const model of ['ask', 'gitflow', 'trunk']) {
    for (const branch of ['main', 'feat/x']) {
      it(`test_when_model_${model}_on_${branch.replace(/\W/g, '_')}_then_pass`, () => {
        const root = buildSandbox({ consent: {}, git: { workflow_model: model, release_branches: ['main'], protected_branches: [], branch_pattern: null } });
        setBranch(root, branch);
        const r = runGuard(root, commit);
        assert.equal(r.decision, 'allow', `model=${model} branch=${branch}: expected topology pass; got ${r.decision} reason=${r.reason}`);
      });
    }
  }

  it('test_when_workflow_model_absent_then_resolves_ask_and_passes', () => {
    const root = buildSandbox({ consent: {}, git: { release_branches: ['main'], protected_branches: [], branch_pattern: null } });
    setBranch(root, 'feat/x');
    const r = runGuard(root, commit);
    assert.equal(r.decision, 'allow', `absent model should resolve to ask (pass); got ${r.decision} reason=${r.reason}`);
  });

  it('test_when_workflow_model_junk_then_resolves_ask_and_passes', () => {
    const root = buildSandbox({ consent: {}, git: { workflow_model: 'DIRECT-TO-MAIN', release_branches: ['main'], protected_branches: [], branch_pattern: null } });
    setBranch(root, 'feat/x');
    const r = runGuard(root, commit);
    assert.equal(r.decision, 'allow', `wrong-case/junk should resolve to ask (pass); got ${r.decision} reason=${r.reason}`);
  });
});

describe('§Behavior #5 — swarm-worktree carve-out', () => {
  it('test_when_direct_to_main_inside_linked_worktree_then_carveout_pass', () => {
    const cfg = { consent: {}, git: { workflow_model: 'direct-to-main', release_branches: ['main'], protected_branches: [], branch_pattern: null } };
    const root = buildSandbox(cfg);
    const wt = addWorktree(root, 'feat/wt', cfg);
    // Same config + feat/wt would BLOCK on the primary tree, but inside the
    // linked worktree the carve-out must let it through.
    const r = runGuard(wt, commit, wt);
    assert.equal(r.decision, 'allow', `expected carve-out pass inside linked worktree; got ${r.decision} reason=${r.reason}`);
  });

  it('test_when_same_config_on_primary_tree_then_blocks', () => {
    // Control: proves the worktree pass above is the carve-out, not config.
    const root = buildSandbox({ consent: {}, git: { workflow_model: 'direct-to-main', release_branches: ['main'], protected_branches: [], branch_pattern: null } });
    setBranch(root, 'feat/wt');
    const r = runGuard(root, commit);
    assert.equal(r.decision, 'deny', `primary tree on feat/wt should block; got ${r.decision} reason=${r.reason}`);
  });
});

describe('§Behavior #6 — ordering + composition (detached, then topology, then consent)', () => {
  it('test_when_topology_pass_on_protected_main_without_consent_then_still_blocked_by_consent', () => {
    // direct-to-main, main IS in release set -> topology PASS; but protected_branches:null
    // means main is protected and no commit_consent token exists -> consent BLOCKS.
    const root = buildSandbox({ consent: { commit_ttl_seconds: 300 }, git: { workflow_model: 'direct-to-main', release_branches: ['main'], protected_branches: null, branch_pattern: null } });
    setBranch(root, 'main');
    const r = runGuard(root, commit);
    assert.equal(r.decision, 'deny', `topology PASS must not mask consent; got ${r.decision} reason=${r.reason}`);
    assert.match(r.reason, /grant-commit/, 'block should come from the consent gate, not topology');
  });

  it('test_when_topology_pass_on_protected_main_with_fresh_consent_then_allows', () => {
    const root = buildSandbox({ consent: { commit_ttl_seconds: 300 }, git: { workflow_model: 'direct-to-main', release_branches: ['main'], protected_branches: null, branch_pattern: null } });
    setBranch(root, 'main');
    writeConsent(root, 'commit_consent', Math.floor(Date.now() / 1000));
    const r = runGuard(root, commit);
    assert.equal(r.decision, 'allow', `topology PASS + fresh consent should allow; got ${r.decision} reason=${r.reason}`);
  });

  it('test_when_detached_head_under_direct_to_main_then_detached_deny_precedes_topology', () => {
    const root = buildSandbox({ consent: {}, git: { workflow_model: 'direct-to-main', release_branches: ['main'], protected_branches: [], branch_pattern: null } });
    detach(root);
    const r = runGuard(root, commit);
    assert.equal(r.decision, 'deny', `detached HEAD should deny; got ${r.decision} reason=${r.reason}`);
    assert.match(r.reason, /detached HEAD/i, 'detached deny must precede topology and name detached HEAD');
  });
});

describe('§Behavior #8 — audit obligations (AC-012)', () => {
  const readRepo = (rel) => readFileSync(join(REPO_ROOT, rel), 'utf8');

  it('test_when_audit_baseline_runs_then_exit0', () => {
    const r = spawnSync('node', [join(REPO_ROOT, '.claude/skills/audit-baseline/audit.mjs')], { encoding: 'utf8', cwd: REPO_ROOT });
    assert.equal(r.status, 0, `audit-baseline must exit 0; got ${r.status}\n${(r.stdout || '').slice(-500)}`);
  });

  it('test_when_top_level_hooks_counted_then_exactly_24', () => {
    const count = readdirSync(join(REPO_ROOT, '.claude/hooks')).filter((n) => n.endsWith('.mjs')).length;
    assert.equal(count, 24, 'top-level hook count is 24 (gitignore_leak_guard added by gitignore-setup)');
  });

  it('test_when_articleVII_topology_present_in_all_three_governance_files', () => {
    for (const f of ['CLAUDE.md', 'src/CLAUDE.template.md', 'docs/init/seed.md']) {
      const text = readRepo(f);
      assert.match(text, /workflow_model/, `${f} must document git.workflow_model`);
      assert.match(text, /overrides Claude's generic branching instincts/, `${f} must carry the Article VII topology precedence clause`);
    }
  });

  it('test_when_claudemd_mirror_compared_then_byte_equal', () => {
    assert.equal(readRepo('CLAUDE.md'), readRepo('src/CLAUDE.template.md'), 'CLAUDE.md and src/CLAUDE.template.md must be byte-equal');
  });
});
