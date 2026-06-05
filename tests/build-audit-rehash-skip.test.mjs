// AC-006: build-template.sh Stage 4 may skip the REDUNDANT per-file hash
// re-computation (the manifest was just stamped this same run), via a new
// `audit.mjs --skip-hash-check` flag — WITHOUT weakening the standalone audit
// that backs the /verify + /integrate verdict. Two guarantees:
//   1. `--skip-hash-check` suppresses ONLY the per-file sha256 re-hash; the
//      other drift checks (counts, citations, names) still run; clean tree → 0.
//   2. Standalone audit (NO flag) still FAILs on a tampered manifest-listed
//      file — hash-drift detection intact (verdict fidelity preserved).
//
// RED until audit.mjs learns `--skip-hash-check`: today the flag is unknown, so
// a tampered tree reports the hash mismatch even WITH the flag, failing #1's
// "skip suppresses the re-hash" expectation.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { cloneAndBuild } from './helpers/clone-and-build.mjs';

function runAudit(root, extraArgs = []) {
  return spawnSync('node', [join(root, '.claude/skills/audit-baseline/audit.mjs'), ...extraArgs], {
    cwd: root,
    env: { ...process.env, CLAUDE_PROJECT_DIR: root },
    encoding: 'utf8',
  });
}

// A baseline-owned, manifest-listed file whose content the audit hashes.
const TAMPER_TARGET = '.claude/skills/audit-baseline/SKILL.md';

describe('audit --skip-hash-check is build-internal only', () => {
  let root;
  before(async () => { root = await cloneAndBuild('rehash-skip-'); });
  after(async () => { if (root) await rm(root, { recursive: true, force: true }); });

  it('test_when_audit_runs_with_skip_hash_check_then_skips_rehash_but_keeps_other_drift_checks', () => {
    const r = runAudit(root, ['--skip-hash-check']);
    assert.equal(r.status, 0, `--skip-hash-check on a clean fresh build must exit 0.\n${r.stdout}\n${r.stderr}`);
    assert.ok(
      !/unknown (option|flag)|invalid argument/i.test(r.stdout + r.stderr),
      `--skip-hash-check must be a recognized flag.\n${r.stdout}\n${r.stderr}`,
    );
  });

  it('test_when_standalone_audit_on_tampered_tree_then_still_fails', async () => {
    const target = join(root, TAMPER_TARGET);
    const original = await readFile(target, 'utf8');
    await writeFile(target, original + '\n<!-- tamper: drift injected -->\n');
    try {
      const full = runAudit(root, []); // no flag — full verdict path
      assert.notEqual(full.status, 0, 'standalone audit (no flag) must FAIL on a tampered manifest-listed file');
      assert.match(full.stdout + full.stderr, /hash mismatch/i, 'failure must name the hash drift');

      // With --skip-hash-check the re-hash is suppressed, so the SAME tamper is
      // NOT reported as a hash mismatch — proving the flag changes behavior and
      // is therefore unsafe for the standalone verdict path (build-internal only).
      const skipped = runAudit(root, ['--skip-hash-check']);
      assert.doesNotMatch(
        skipped.stdout + skipped.stderr,
        /hash mismatch/i,
        '--skip-hash-check must suppress the per-file hash re-check',
      );
    } finally {
      await writeFile(target, original);
    }
  });
});
