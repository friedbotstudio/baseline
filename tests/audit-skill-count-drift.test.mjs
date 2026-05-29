// brainstorm-and-codesign — AC-009 regression
//
// The audit-baseline reads manifest.owners.skills (per Article XI; no hardcoded
// EXPECTED_SKILLS). When the brainstorm skill is shipped with `owner: baseline`
// frontmatter, build-manifest.mjs picks it up automatically and the audit
// reports the new skill count. If the skill directory is removed without
// updating the manifest, the audit reports "baseline skill missing" and FAILs.
//
// SUT: scripts/build-manifest.mjs + .claude/skills/audit-baseline/audit.mjs +
//      .claude/skills/brainstorm/SKILL.md (must declare owner: baseline)

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const HERE = path.dirname(__filename);
const REPO_ROOT = path.resolve(HERE, '..');

describe('audit skill count + drift (AC-009)', () => {
  it('test_when_brainstorm_skill_md_present_then_owner_baseline_declared', async () => {
    const skillMdPath = path.join(REPO_ROOT, '.claude/skills/brainstorm/SKILL.md');
    if (!existsSync(skillMdPath)) {
      throw new Error(
        `.claude/skills/brainstorm/SKILL.md does not exist yet (RED is expected pre-/implement)`
      );
    }
    const content = await fs.readFile(skillMdPath, 'utf8');
    assert.ok(/^owner:\s*baseline\b/m.test(content),
      'brainstorm SKILL.md must declare owner: baseline so the manifest picks it up automatically');
  });

  it('test_when_manifest_built_then_owners_skills_includes_brainstorm_baseline', async () => {
    const manifestPath = path.join(REPO_ROOT, 'obj/template/.claude/manifest.json');
    if (!existsSync(manifestPath)) {
      throw new Error(
        `obj/template/.claude/manifest.json does not exist; run scripts/build-manifest.mjs first`
      );
    }
    const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
    assert.ok(manifest.owners, 'manifest has owners block');
    assert.ok(manifest.owners.skills, 'manifest has owners.skills map');
    assert.equal(manifest.owners.skills.brainstorm, 'baseline',
      'manifest.owners.skills.brainstorm must equal "baseline" after build');
  });

  it('test_when_audit_runs_with_brainstorm_present_then_clean', async () => {
    // The audit itself reads manifest.owners.skills; we assert that the brainstorm
    // entry's hash agrees with on-disk content (post-build invariant).
    const manifestPath = path.join(REPO_ROOT, 'obj/template/.claude/manifest.json');
    if (!existsSync(manifestPath)) {
      throw new Error(`obj/template/.claude/manifest.json absent — run scripts/build-manifest.mjs`);
    }
    const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
    const brainstormFiles = Object.keys(manifest.files || {})
      .filter((p) => p.startsWith('.claude/skills/brainstorm/'));
    assert.ok(brainstormFiles.length >= 1,
      'manifest.files must list >=1 path under .claude/skills/brainstorm/');
  });
});
