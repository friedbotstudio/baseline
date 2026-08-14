// Build integration: stamping order, manifest agreement, and what must NOT ship.
//
// These read the real dev tree and the real obj/template rather than a fixture. The
// property under test is that two independently-produced byte streams agree, and a
// fixture would only prove the fixture agreed with itself.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

import { REPO_ROOT, readFileSync, existsSync, tryImport } from './helpers/memory-fixtures.mjs';

const BUILD = 'scripts/build-template.sh';
const MANIFEST = 'obj/template/.claude/manifest.json';
const CONSTITUTION = 'CLAUDE.md';
const MIRROR = 'src/CLAUDE.template.md';
const CAP = 40000;

function read(rel) {
  return readFileSync(join(REPO_ROOT, rel), 'utf8');
}

describe('character doctrine — build integration', () => {
  it('test_when_build_runs_then_stage_0c_precedes_stage_1', () => {
    // Covers AC-005.
    const script = read(BUILD);
    const stamp = script.indexOf('stamp-character.mjs');
    const rsync = script.search(/^# Stage 1 —/m);
    assert.notEqual(stamp, -1, 'build-template.sh must invoke the stamper');
    assert.ok(
      stamp < rsync,
      'Stage 1 copies .claude/ verbatim and build-manifest.mjs hashes the COPY, while audit-baseline re-hashes the DEV tree — stamping after the rsync makes every shipped target fail hash mismatch',
    );
  });

  it('test_when_build_completes_then_dev_and_template_bytes_agree', async () => {
    // Covers AC-005, AC-012 — dev bytes equal to the manifest sha256 IS the
    // "no hash mismatch" half of the audit verdict, measured per stamped target.
    const render = await tryImport('.claude/skills/audit-baseline/character.mjs');
    assert.ok(render, 'character.mjs must exist');
    const manifest = JSON.parse(read(MANIFEST));
    const slugs = Object.keys(render.loadDoctrine(REPO_ROOT).skills);
    let checked = 0;
    for (const slug of slugs) {
      const rel = `.claude/skills/${slug}/SKILL.md`;
      const entry = manifest.files?.[rel];
      if (!entry) continue;
      const expected = typeof entry === 'string' ? entry : entry.sha256;
      const actual = createHash('sha256').update(readFileSync(join(REPO_ROOT, rel))).digest('hex');
      assert.equal(actual, expected, `${rel} dev bytes must match the manifest sha256`);
      checked += 1;
    }
    assert.ok(checked > 0, 'at least one stamped target must appear in the manifest');
  });

  it('test_when_build_completes_then_dev_only_skills_stay_unshipped', async () => {
    // Covers AC-008.
    const render = await tryImport('.claude/skills/audit-baseline/character.mjs');
    assert.ok(render, 'character.mjs must exist');
    const skill = read('.claude/skills/spec-shippability-review/SKILL.md');
    assert.ok(render.extractBlock(skill), 'the dev-only skill still carries a character block');
    assert.ok(
      !/^owner:/m.test(skill.split('---')[1] ?? ''),
      'intake D-4: annotating it owner: baseline would ship a maintainer tool that reads obj/template paths no consumer has',
    );
    assert.ok(
      !existsSync(join(REPO_ROOT, 'obj/template/.claude/skills/spec-shippability-review')),
      'Stage 1.5 must still prune it from the shipped tree',
    );
  });

  it('test_when_constitution_compared_to_mirror_then_bytes_equal_and_under_cap', () => {
    // Covers AC-023.
    const constitution = read(CONSTITUTION);
    assert.equal(constitution, read(MIRROR), `${CONSTITUTION} and ${MIRROR} are a byte-equal pair (Art. XII.4)`);
    assert.ok(constitution.length < CAP, `${CONSTITUTION} is ${constitution.length} chars, cap is ${CAP}`);
  });

  it('test_when_shipped_scanner_runs_then_no_blocker_from_character_blocks', async () => {
    // Covers AC-024.
    const { execFileSync } = await import('node:child_process');
    const out = execFileSync('node', [
      '.claude/skills/spec-shippability-review/scan-shipped-skills.mjs',
      '--root', '.claude/skills', '--report-root', REPO_ROOT,
    ], { cwd: REPO_ROOT, encoding: 'utf8' });
    assert.match(out, /BLOCKER:\s*0/);
  });
});
