#!/usr/bin/env node
// Covers AC-003 of remove-python-runtime-dep.
// swarm_merge.mjs — post-task merge + audit tool for worktree-isolated swarm tasks.
//
// Usage:  swarm_merge.mjs <plan-path> <task-id> <worktree-path>
//
// Preconditions:
//   .claude/state/swarm/active_wave.json exists and contains `baseline_ref`
//   (the commit SHA recorded when the wave started). The audit diffs the
//   worktree against this baseline.
//
// Behaviour:
//   1. Loads the task's write_set from the plan.
//   2. Computes changed files: `git -C <worktree> diff <baseline> --name-only`.
//   3. AUDIT: every changed file must be in write_set. Any violation → fail loud,
//      preserve the worktree, exit 1.
//   4. If clean: `git -C <worktree> diff <baseline>` | `git -C <main> apply` to
//      land the changes on main.
//   5. Removes the worktree on success (`git worktree remove`).
//
// Exit codes:
//   0   merge applied successfully (or task made no changes)
//   1   audit failed, apply failed, or worktree could not be read
//   2   bad invocation / missing inputs

import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

function fail(msg) { process.stderr.write(`swarm_merge: ${msg}\n`); }

function loadJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function main(argv) {
  if (argv.length < 3 || !argv[0] || !argv[1] || !argv[2]) {
    process.stderr.write('usage: swarm_merge.mjs <plan-path> <task-id> <worktree-path>\n');
    process.exit(2);
  }
  const [planPath, taskId, wt] = argv;
  const root = process.env.CLAUDE_PROJECT_DIR || process.cwd();

  if (!existsSync(planPath)) {
    fail(`plan not found at ${planPath}`);
    process.exit(2);
  }
  let wtStat;
  try { wtStat = statSync(wt); } catch { fail(`worktree not found at ${wt}`); process.exit(2); }
  if (!wtStat.isDirectory()) { fail(`worktree path is not a directory: ${wt}`); process.exit(2); }

  const plan = loadJson(planPath);
  const task = (plan.tasks || []).find(t => t && t.id === taskId);
  if (!task) {
    fail(`task ${taskId} not found in plan`);
    process.exit(2);
  }
  const writeSet = new Set(task.write_set || []);
  if (writeSet.size === 0) {
    fail(`task ${taskId} has empty write_set — refusing to merge`);
    process.exit(2);
  }

  const activePath = join(root, '.claude', 'state', 'swarm', 'active_wave.json');
  let active;
  try { active = loadJson(activePath); } catch (e) {
    fail(`active_wave.json unreadable: ${e.message}`); process.exit(2);
  }
  const baseline = active.baseline_ref;
  if (!baseline) {
    fail('active_wave.json missing baseline_ref'); process.exit(2);
  }

  const diffNames = spawnSync('git', ['-C', wt, 'diff', baseline, '--name-only'], { encoding: 'utf8' });
  if (diffNames.status !== 0) {
    fail(`\`git diff\` in worktree failed: ${diffNames.stderr}`);
    process.exit(1);
  }
  const changed = diffNames.stdout.split('\n').map(s => s.trim()).filter(Boolean);

  if (changed.length === 0) {
    const rm = spawnSync('git', ['-C', root, 'worktree', 'remove', wt], { encoding: 'utf8' });
    if (rm.status !== 0) {
      fail(`worktree removal warned: ${(rm.stderr || '').trim()}`);
    }
    process.stdout.write(`swarm_merge: OK — task ${taskId} made no changes; worktree cleaned up\n`);
    process.exit(0);
  }

  const violations = changed.filter(f => !writeSet.has(f));
  if (violations.length > 0) {
    process.stdout.write(`swarm_merge: AUDIT FAIL — task ${taskId} modified files outside its declared write_set:\n`);
    for (const v of [...violations].sort()) process.stdout.write(`  + ${v}\n`);
    process.stdout.write(`Declared write_set (${writeSet.size} file(s)):\n`);
    for (const f of [...writeSet].sort()) process.stdout.write(`  - ${f}\n`);
    process.stdout.write(`Worktree preserved for inspection at: ${wt}\n`);
    process.stdout.write(`Branch: swarm/${taskId} (inspect with \`git log swarm/${taskId}\` or \`git diff ${baseline}..swarm/${taskId}\`)\n`);
    process.exit(1);
  }

  const fullDiff = spawnSync('git', ['-C', wt, 'diff', baseline], { encoding: 'utf8' });
  if (fullDiff.status !== 0) {
    fail(`\`git diff\` (full patch) failed: ${fullDiff.stderr}`);
    process.exit(1);
  }
  const patch = fullDiff.stdout;
  if (!patch.trim()) {
    fail(`diff was empty despite changed files. Worktree preserved at ${wt}`);
    process.exit(1);
  }

  const apply = spawnSync('git', ['-C', root, 'apply', '--whitespace=nowarn', '-'], {
    input: patch, encoding: 'utf8',
  });
  if (apply.status !== 0) {
    process.stdout.write(`swarm_merge: APPLY FAIL — patch from ${wt} did not apply cleanly to main:\n`);
    process.stdout.write((apply.stderr || '').trim() + '\n');
    process.stdout.write(`Worktree preserved for inspection at: ${wt}\n`);
    process.exit(1);
  }

  const rm = spawnSync('git', ['-C', root, 'worktree', 'remove', wt], { encoding: 'utf8' });
  if (rm.status !== 0) {
    fail(`WARNING — could not remove worktree at ${wt}: ${(rm.stderr || '').trim()}`);
  }

  process.stdout.write(`swarm_merge: OK — task ${taskId} merged (${changed.length} file(s))\n`);
  for (const f of [...changed].sort()) process.stdout.write(`  + ${f}\n`);
}

main(process.argv.slice(2));
