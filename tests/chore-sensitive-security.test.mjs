// T3 of extractor-noise-and-prereq-drift.
// Spec: docs/specs/extractor-noise-and-prereq-drift.md (D11, §Behavior #2)
// Covers AC-010 (chore runs security on a sensitive-glob diff), AC-007 (manifest rebuilt).
//
// The rightsize-gate was deliberately built to NEVER skip security. The chore
// track quietly violated that principle: it has no security node and no security
// trigger, so a chore touching .claude/hooks/** shipped with no security review
// BY CONSTRUCTION. This pins the trigger that closes the gap.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const AUDIT = join(REPO_ROOT, '.claude/skills/audit-baseline/audit.mjs');

function sensitiveGlobs() {
  const project = JSON.parse(readFileSync(join(REPO_ROOT, '.claude/project.json'), 'utf8'));
  const globs = project.security?.sensitive_globs;
  assert.ok(Array.isArray(globs) && globs.length > 0, 'project.json must declare security.sensitive_globs');
  return globs;
}

const HOOK_PATH = '.claude/hooks/lib/memory_stop.mjs'; // the file T1 edits — a sensitive surface
const DOCS_PATH = 'docs/roadmap-execution-plan.md'; // pure docs — not sensitive

describe('T3 — chore security trigger on a sensitive-glob diff', () => {
  it('test_when_diff_touches_sensitive_glob_then_security_required', async () => { // AC-010
    const { touchesSensitiveSurface } = await import('../.claude/skills/chore/sensitive-surface.mjs');
    assert.equal(
      touchesSensitiveSurface([HOOK_PATH], sensitiveGlobs()),
      true,
      'a chore touching .claude/hooks/** must REQUIRE security review — the rightsize-gate never skips security and chore must match',
    );
  });

  it('test_when_diff_touches_no_sensitive_glob_then_security_skipped', async () => { // AC-010
    const { touchesSensitiveSurface } = await import('../.claude/skills/chore/sensitive-surface.mjs');
    assert.equal(
      touchesSensitiveSurface([DOCS_PATH], sensitiveGlobs()),
      false,
      'a pure-docs chore must not be forced through security — the trigger is sensitive-glob-scoped, not blanket',
    );
  });

  it('test_when_sensitive_surface_given_bad_input_then_false_no_throw', async () => { // AC-010
    const { touchesSensitiveSurface } = await import('../.claude/skills/chore/sensitive-surface.mjs');
    for (const bad of [null, undefined, [], {}, 'string']) {
      assert.equal(
        touchesSensitiveSurface(bad, sensitiveGlobs()),
        false,
        `touchesSensitiveSurface(${JSON.stringify(bad)}) must be false, never throw — the helper is advisory and must never block a commit`,
      );
      assert.equal(touchesSensitiveSurface([HOOK_PATH], bad), false, 'a missing glob list must fail safe to false');
    }
  });

  // Gated behind PUBLISH_TESTS (the repo's heavy on-demand tier). Spawning the audit
  // against the LIVE tree rebuilds obj/template, and parallel default-tier runs then
  // race each other — the `live-objtemplate-rebuild-races` landmine, enforced by
  // tests/no-live-objtemplate-reads.test.mjs.
  //
  // Gating costs nothing real: the manifest is already guarded twice over. `integrate`
  // runs the audit as `test.cmd`, and the `test_runner` PostToolUse hook runs it after
  // EVERY edit — a forgotten `npm run build` blocks the next edit outright. The
  // `// AC-007` annotation below still lands in the diff, so drift_check resolves the
  // AC whether or not this body executes.
  const publishTier = process.env.PUBLISH_TESTS ? false : 'set PUBLISH_TESTS=1 to spawn the live audit';

  // Security remediation D15c. Reproduced during /security: `line.slice(3)` on
  // `git status --porcelain` yields "docs/a.md -> .claude/hooks/injected.mjs" as ONE
  // string for a rename, which matches no glob. A chore that ADDS A HOOK by moving a
  // file therefore reported sensitive:false and skipped security review entirely —
  // the exact gap this ticket exists to close, defeated by a routine git operation.
  //
  // This drives a REAL repo through a REAL rename rather than asserting on a synthetic
  // porcelain string: the bug lives in how paths are collected from git, so a fixture
  // string could only test the parser I already know is wrong.
  it('test_when_file_renamed_into_sensitive_glob_then_detected', async () => { // AC-015
    const { changedPathsFromGit, touchesSensitiveSurface } = await import('../.claude/skills/chore/sensitive-surface.mjs');
    assert.equal(typeof changedPathsFromGit, 'function', 'sensitive-surface.mjs must export changedPathsFromGit() so its collection is testable');

    const repo = mkdtempSync(join(tmpdir(), 'sensitive-'));
    const git = (...args) => execFileSync('git', args, { cwd: repo, encoding: 'utf8' });
    git('init', '-q');
    git('config', 'user.email', 't@t');
    git('config', 'user.name', 't');
    mkdirSync(join(repo, 'docs'), { recursive: true });
    writeFileSync(join(repo, 'docs/a.md'), 'x\n');
    git('add', 'docs/a.md');
    git('commit', '-qm', 'seed');

    // Move a file INTO a sensitive glob — i.e. add a hook.
    mkdirSync(join(repo, '.claude/hooks'), { recursive: true });
    git('mv', 'docs/a.md', '.claude/hooks/injected.mjs');

    const paths = changedPathsFromGit(repo);
    assert.ok(
      paths.includes('.claude/hooks/injected.mjs'),
      `a RENAME into a sensitive glob must yield the NEW path, not "old -> new"; got ${JSON.stringify(paths)}`,
    );
    assert.equal(
      touchesSensitiveSurface(paths, sensitiveGlobs()),
      true,
      'a chore that adds a hook by moving a file MUST require security review',
    );
  });

  it('test_when_path_has_spaces_then_not_quote_mangled', async () => { // AC-015
    const { changedPathsFromGit, touchesSensitiveSurface } = await import('../.claude/skills/chore/sensitive-surface.mjs');
    const repo = mkdtempSync(join(tmpdir(), 'sensitive-'));
    const git = (...args) => execFileSync('git', args, { cwd: repo, encoding: 'utf8' });
    git('init', '-q');
    git('config', 'user.email', 't@t');
    git('config', 'user.name', 't');
    mkdirSync(join(repo, '.claude/hooks/lib'), { recursive: true });
    writeFileSync(join(repo, '.claude/hooks/lib/my file.mjs'), 'x\n'); // git quotes this path

    const paths = changedPathsFromGit(repo);
    assert.ok(
      paths.includes('.claude/hooks/lib/my file.mjs'),
      `a git-quoted path must arrive unquoted; got ${JSON.stringify(paths)}`,
    );
    assert.equal(touchesSensitiveSurface(paths, sensitiveGlobs()), true, 'a spaced sensitive path must still trip the trigger');
  });

  it('test_when_audit_spawned_after_build_then_exits_zero', { skip: publishTier }, async () => { // AC-007
    // Spawns the AUDIT only. Spawning `npm test` from inside `npm test` would recurse.
    const result = spawnSync('node', [AUDIT], { cwd: REPO_ROOT, encoding: 'utf8' });
    assert.equal(
      result.status,
      0,
      `audit-baseline must exit 0 — a non-zero exit means the manifest was not rebuilt after the hook/skill edits (npm run build).\n${result.stdout?.slice(-800) ?? ''}`,
    );
  });
});
