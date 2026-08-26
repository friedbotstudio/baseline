#!/usr/bin/env node
// swarm_wave_audit — D2 of swarm-mode-first-run-hardening (-e3f2).
//
// Shared-isolation swarm waves have no per-task merge-audit (no worktrees to
// diff), and swarm_boundary_guard exempts `.claude/` — so write_sets are NOT
// enforced under `.claude/skills/**`, exactly where baseline self-dev lives.
// This post-wave audit closes that blind spot: it diffs a wave's changes
// against the union of its tasks' write_sets DIRECTLY (it does not consult the
// guard's exempt list), so `.claude/skills/**` drift is caught.
//
// Usage:  swarm_wave_audit.mjs <plan-path> <wave-index>
//   Reads .claude/state/swarm/active_wave.json for the wave's write_sets and
//   the `pre_wave_changed` snapshot (written by swarm-dispatch at wave start),
//   computes current changed paths via `git status --porcelain`, subtracts the
//   pre-wave snapshot, and audits the remainder against the union write_set.
//
// Exit codes: 0 clean · 1 violation · 2 bad invocation / missing inputs.

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

function fail(msg) { process.stderr.write(`swarm_wave_audit: ${msg}\n`); }

// Pure core: which changed paths fall outside the union write_set.
export function auditWave(changedPaths, unionWriteSet) {
  const allowed = new Set(unionWriteSet || []);
  const violations = [...new Set(changedPaths || [])]
    .filter((p) => !allowed.has(p))
    .sort();
  return { ok: violations.length === 0, violations };
}

function parsePorcelainPaths(porcelain) {
  const paths = [];
  for (const raw of porcelain.split('\n')) {
    const line = raw.replace(/\r$/, '');
    if (!line.trim()) continue;
    let rest = line.slice(3); // strip the 2-char status + 1 space
    const arrow = rest.indexOf(' -> ');
    if (arrow !== -1) rest = rest.slice(arrow + 4); // rename/copy: take the destination
    rest = rest.replace(/^"(.*)"$/, '$1'); // unquote paths with special chars
    if (rest) paths.push(rest);
  }
  return paths;
}

function unionFromActiveWave(active) {
  const files = new Set();
  for (const entry of active.write_sets || []) {
    for (const f of entry.files || []) files.add(f);
  }
  return [...files];
}

function main(argv) {
  if (argv.length < 2 || !argv[0] || argv[1] === undefined || argv[1] === '') {
    process.stderr.write('usage: swarm_wave_audit.mjs <plan-path> <wave-index>\n');
    process.exit(2);
  }
  const [planPath] = argv;
  const root = process.env.CLAUDE_PROJECT_DIR || process.cwd();

  if (!existsSync(planPath)) { fail(`plan not found at ${planPath}`); process.exit(2); }

  const activePath = join(root, '.claude', 'state', 'swarm', 'active_wave.json');
  let active;
  try { active = JSON.parse(readFileSync(activePath, 'utf8')); }
  catch (e) { fail(`active_wave.json unreadable: ${e.message}`); process.exit(2); }

  // `-uall` is load-bearing: plain `--porcelain` collapses a wholly-new untracked
  // directory to one path (`newdir/`), which never matches a union write_set that lists
  // files, so a task that creates a directory false-fails its wave.
  const status = spawnSync('git', ['-C', root, 'status', '--porcelain', '-uall'], { encoding: 'utf8' });
  if (status.status !== 0) { fail(`git status failed: ${status.stderr}`); process.exit(2); }

  const preWave = new Set(active.pre_wave_changed || []);
  const changedNow = parsePorcelainPaths(status.stdout);
  const waveChanges = changedNow.filter((p) => !preWave.has(p));

  const union = unionFromActiveWave(active);
  const { ok, violations } = auditWave(waveChanges, union);

  if (ok) {
    process.stdout.write(`swarm_wave_audit: OK — wave changes (${waveChanges.length}) all within the union write_set\n`);
    process.exit(0);
  }

  process.stdout.write('swarm_wave_audit: AUDIT FAIL — wave changes outside the union write_set:\n');
  for (const v of violations) process.stdout.write(`  + ${v}\n`);
  process.stdout.write(`Union write_set (${union.length} file(s)):\n`);
  for (const f of [...union].sort()) process.stdout.write(`  - ${f}\n`);
  process.exit(1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2));
}
