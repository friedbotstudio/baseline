// Tests for the new /upgrade-project skill at .claude/skills/upgrade-project/SKILL.md.
// The skill itself is LLM-driven (prose-driven, like every other workflow skill),
// so these tests verify the skill's SHAPE — frontmatter validity, contract
// documentation, and manifest registration — not the LLM's reasoning.
// The Article-XI reproducer behavior is dogfooded by running /upgrade-project
// on a real staging fixture; that is not a unit test.
//
// RED until .claude/skills/upgrade-project/SKILL.md exists.
// See docs/specs/upgrade-flow-rework.md §Behavior #4, #8, #9; AC-005, AC-006, AC-011, AC-012.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');
const SKILL_PATH = join(repoRoot, '.claude/skills/upgrade-project/SKILL.md');

function parseFrontmatter(text) {
  const m = text.match(/^---\n([\s\S]*?)\n---\n/);
  if (!m) return null;
  const obj = {};
  for (const line of m[1].split('\n')) {
    const kv = line.match(/^(\w+):\s*(.+)$/);
    if (kv) obj[kv[1]] = kv[2].trim();
  }
  return obj;
}

describe('/upgrade-project skill — shape', () => {
  it('test_when_upgrade_project_skill_md_exists_then_frontmatter_valid', async () => {
    assert.ok(existsSync(SKILL_PATH),
      `expected skill file at ${SKILL_PATH}`);

    const text = await readFile(SKILL_PATH, 'utf8');
    const fm = parseFrontmatter(text);
    assert.ok(fm, 'skill must declare YAML frontmatter delimited by --- lines');
    assert.equal(fm.name, 'upgrade-project',
      `frontmatter name must be "upgrade-project"; got ${fm.name}`);
    assert.equal(fm.owner, 'baseline',
      `frontmatter owner must be "baseline" per Article XI; got ${fm.owner}`);
    assert.ok(fm.description && fm.description.length > 0,
      'frontmatter description must be non-empty');
  });

  it('test_when_upgrade_project_skill_md_then_body_names_required_contracts', async () => {
    const text = await readFile(SKILL_PATH, 'utf8');
    const body = text.replace(/^---\n[\s\S]*?\n---\n/, '');

    const required = [
      'BASE',
      'INCOMING', // or REMOTE — accept either spelling
      'stage manifest',
      'dry-run',
      'NEEDS_USER_INPUT',
      'PENDING',
      'RECONCILED',
    ];
    for (const phrase of required) {
      if (phrase === 'INCOMING') {
        assert.ok(/INCOMING|REMOTE/.test(body),
          `skill body must reference INCOMING (or REMOTE) — the third leg of the 3-way merge`);
      } else {
        assert.ok(body.includes(phrase),
          `skill body must reference "${phrase}" — required contract per spec §Behavior #4/#8/#9`);
      }
    }
  });

  it('test_when_upgrade_project_skill_md_then_audit_baseline_recognizes_it', async () => {
    // Build the shipped manifest from the live repo into a tmp; verify the new skill
    // shows up in manifest.owners.skills.
    const tmp = await mkdtemp(join(tmpdir(), 'upgrade-project-manifest-'));
    const rsync = spawnSync('rsync', [
      '-a',
      '--exclude=node_modules', '--exclude=obj', '--exclude=.git',
      '--exclude=docs/archive', '--exclude=.playwright-mcp',
      `${repoRoot}/`,
      tmp,
    ], { encoding: 'utf8' });
    if (rsync.status !== 0) throw new Error(`rsync failed: ${rsync.stderr}`);

    const build = spawnSync('bash', [join(tmp, 'scripts/build-template.sh')], {
      env: { ...process.env, PKG_ROOT: tmp, CLAUDE_PROJECT_DIR: tmp },
      encoding: 'utf8',
    });
    if (build.status !== 0) throw new Error(`build failed: ${build.stderr || build.stdout}`);

    const manifestPath = join(tmp, 'obj/template/.claude/manifest.json');
    const m = JSON.parse(await readFile(manifestPath, 'utf8'));
    assert.ok(m.owners && m.owners.skills,
      'shipped manifest must have owners.skills map');
    assert.equal(m.owners.skills['upgrade-project'], 'baseline',
      'upgrade-project must be registered as a baseline-owned skill in owners.skills');
  });

  it('test_when_upgrade_project_skill_md_then_describes_renumbering_rule', async () => {
    const text = await readFile(SKILL_PATH, 'utf8');
    const body = text.replace(/^---\n[\s\S]*?\n---\n/, '');

    // The zero-drift renumbering rule per AC-006: always shift user content to
    // the next available slot, never fold. The skill body must say so.
    const hasShiftLanguage = /next available|shift|renumber/i.test(body);
    assert.ok(hasShiftLanguage,
      'skill body must state the renumbering principle (key phrase: "next available" / "shift" / "renumber")');
    const hasNoFoldLanguage = /never fold|do not fold|no fold/i.test(body);
    assert.ok(hasNoFoldLanguage,
      'skill body must state that folding into existing sections is forbidden (key phrase: "never fold")');
  });
});
