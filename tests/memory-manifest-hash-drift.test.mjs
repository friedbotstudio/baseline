// Batch integrity — AC-013 of docs/specs/living-system-model-abcd.md (§Behavior #4).
//
// This is the trap decision B5 exists to disarm, pinned as a test rather than left
// as a procedural note. Mechanism:
//   project.json → test.cmd is `audit.mjs --file={file}`, so test_runner runs the
//   FULL audit after every .claude/** write (audit.mjs:62-76 only gates in-scope vs
//   out-of-scope; an in-scope file runs every check).
//   skill-ownership.mjs:30-37 re-hashes every manifest-listed file under a
//   baseline-owned skill dir and FAILs on mismatch.
// Tickets B and D both edit .claude/skills/memory-sync/. Without an immediate
// `npm run manifest:refresh`, ticket C and D read a red audit that ticket B caused
// — the batch loses its test signal exactly where it is most needed.
//
// The assertion is on the DETECTION, not on the drift: a mutated baseline-owned
// file must be reported, so the batch cannot carry an unrefreshed manifest forward.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

import { REPO_ROOT } from './helpers/memory-fixtures.mjs';

const CHECK_MODULE = '.claude/skills/audit-baseline/checks/skill-ownership.mjs';
const SKILL_SLUG = 'memory-sync';
const TRACKED_FILE = `.claude/skills/${SKILL_SLUG}/route.mjs`;

function sha256(buf) {
  return createHash('sha256').update(buf).digest('hex');
}

// A minimal stand-in for the audit's ctx: real files on a real temp tree, a real
// manifest shape. Nothing internal is mocked (Article VI.3) — this is the same
// data shape loadManifest() returns.
function makeAuditFixture() {
  const root = mkdtempSync(join(tmpdir(), 'manifest-drift-'));
  const skillDir = join(root, '.claude', 'skills', SKILL_SLUG);
  mkdirSync(skillDir, { recursive: true });

  const contents = readFileSync(join(REPO_ROOT, TRACKED_FILE));
  writeFileSync(join(root, TRACKED_FILE), contents);

  const manifest = {
    owners: { skills: { [SKILL_SLUG]: 'baseline' } },
    files: { [TRACKED_FILE]: { sha256: sha256(contents) } },
  };

  return {
    root,
    ctx: {
      root,
      diskSkills: new Set(),
      readSkillOwner: () => null,
      loadManifest: () => manifest,
      skipHashCheck: false,
    },
  };
}

describe('manifest hash-drift detection (batch integrity)', () => {
  it('test_when_baseline_skill_file_edited_without_manifest_refresh_then_audit_reports_hash_mismatch', async () => {
    const { root, ctx } = makeAuditFixture();
    const mod = await import(join(REPO_ROOT, CHECK_MODULE));

    const clean = mod.run(ctx);
    assert.ok(
      !clean.some(([, status]) => status === 'FAIL'),
      'precondition: an un-mutated tree matching the manifest reports no FAIL',
    );

    // Simulate what ticket B does to route.mjs — an ordinary, legitimate edit.
    const target = join(root, TRACKED_FILE);
    assert.ok(existsSync(target), 'fixture wrote the tracked file');
    writeFileSync(target, readFileSync(target, 'utf8') + '\n// ticket B: constraint bucket\n');

    const drifted = mod.run(ctx);
    const failures = drifted.filter(([, status]) => status === 'FAIL');

    assert.ok(
      failures.length >= 1,
      'editing a manifest-listed file under a baseline-owned skill dir MUST be reported — this is the condition AC-013 forbids carrying into the next phase',
    );
    assert.match(
      failures.map(([, , detail]) => detail).join(' '),
      /hash mismatch/,
      'the failure names hash drift specifically, so the fix (npm run manifest:refresh) is unambiguous (AC-013, rollout prerequisite P4)',
    );
  });
});
