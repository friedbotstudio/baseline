// The stamper's own behaviour: which files it touches, and what it refuses.
//
// character-doctrine-build.test.mjs asserts the build ORDER and the manifest
// agreement; this file asserts what stampAll does to a tree, which is the half that
// needs a throwaway root rather than the live repo.

import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { REPO_ROOT, tryImport } from './helpers/memory-fixtures.mjs';

const MODULE = 'scripts/stamp-character.mjs';

let stamper;
let render;
before(async () => {
  stamper = await tryImport(MODULE);
  render = await tryImport('.claude/skills/audit-baseline/character.mjs');
  assert.ok(stamper, `${MODULE} must exist and export stampAll`);
  assert.ok(render, 'character.mjs must exist');
});

function buildRoot({ omit = [], bodies = {} } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'stamper-'));
  mkdirSync(join(root, '.claude', 'skills', 'audit-baseline'), { recursive: true });
  writeFileSync(
    join(root, '.claude/skills/audit-baseline/character.json'),
    readFileSync(join(REPO_ROOT, '.claude/skills/audit-baseline/character.json'), 'utf8'),
  );
  for (const slug of Object.keys(render.loadDoctrine(REPO_ROOT).skills)) {
    if (omit.includes(slug)) continue;
    mkdirSync(join(root, '.claude', 'skills', slug), { recursive: true });
    const body = bodies[slug] ?? ['---', `name: ${slug}`, '---', '', `# ${slug}`, ''].join('\n');
    writeFileSync(join(root, '.claude', 'skills', slug, 'SKILL.md'), body);
  }
  return root;
}

function withRoot(options, assertion) {
  const root = buildRoot(options);
  try { assertion(root); } finally { rmSync(root, { recursive: true, force: true }); }
}

const silent = { log: () => {} };

describe('stamp-character', () => {
  it('test_when_tree_unstamped_then_every_present_target_is_written', () => {
    // Covers AC-005, AC-008. A truthy extractBlock only proves the sentinels landed;
    // the bullet count is what proves the six-field render reached all fourteen.
    withRoot({}, (root) => {
      const changed = stamper.stampAll(root, silent);
      assert.equal(changed.length, 14);
      for (const rel of changed) {
        const text = readFileSync(join(root, rel), 'utf8');
        assert.ok(render.extractBlock(text), `${rel} must carry a block`);
        assert.equal(
          (text.match(/<!-- character:begin -->/g) || []).length, 1,
          `${rel} must carry exactly one block — a second means the stamper appended instead of replacing`,
        );
        assert.equal(
          (text.match(/^- \*\*\w+\.\*\*/gm) || []).length, render.PARTS.length,
          `${rel} must carry one bullet per PARTS entry`,
        );
      }
    });
  });

  it('test_when_target_dir_absent_then_stamper_skips_it_without_error', () => {
    // Covers AC-007.
    withRoot({ omit: ['security', 'tdd'] }, (root) => {
      const changed = stamper.stampAll(root, silent);
      assert.equal(changed.length, 12);
      assert.ok(!changed.some((rel) => rel.includes('/security/') || rel.includes('/tdd/')));
    });
  });

  it('test_when_run_twice_then_second_run_writes_nothing', () => {
    // Covers AC-025.
    withRoot({}, (root) => {
      stamper.stampAll(root, silent);
      const before = statSync(join(root, '.claude/skills/spec/SKILL.md')).mtimeMs;
      assert.deepEqual(
        stamper.stampAll(root, silent), [],
        'an idempotent stamper is what lets Stage 0c run on every build without producing a diff',
      );
      assert.equal(statSync(join(root, '.claude/skills/spec/SKILL.md')).mtimeMs, before);
    });
  });

  it('test_when_target_lacks_frontmatter_then_stamper_throws_naming_the_path', () => {
    // Covers AC-005.
    withRoot({ bodies: { integrate: '# integrate\n\nNo frontmatter at all.\n' } }, (root) => {
      assert.throws(
        () => stamper.stampAll(root, silent),
        (error) => /integrate\/SKILL\.md/.test(error.message) && /frontmatter/i.test(error.message),
        'stampSkill takes text and cannot name the file; the CLI holds both and attaches the path',
      );
    });
  });

  it('test_when_doctrine_key_traverses_then_stamper_rejects_the_whole_run', () => {
    // Covers AC-026.
    const root = mkdtempSync(join(tmpdir(), 'stamper-evil-'));
    mkdirSync(join(root, '.claude', 'skills', 'audit-baseline'), { recursive: true });
    writeFileSync(
      join(root, '.claude/skills/audit-baseline/character.json'),
      JSON.stringify({ version: 1, skills: { '../../VICTIM': { soul: 'a', motivation: 'b', mantra: 'c' } } }),
    );
    mkdirSync(join(root, 'VICTIM'), { recursive: true });
    const victim = join(root, 'VICTIM', 'SKILL.md');
    writeFileSync(victim, '---\nname: victim\n---\n\n# victim\n');
    try {
      assert.throws(
        () => stamper.stampAll(root, silent),
        /slug/i,
        'REJECT, never repair — normalizing a traversing key would silently write to a different path',
      );
      assert.ok(
        !readFileSync(victim, 'utf8').includes('character:begin'),
        'the guard must fire before any write, not after the first one lands',
      );
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it('test_when_stamper_logs_then_one_line_names_each_changed_file', () => {
    // Covers AC-005.
    withRoot({}, (root) => {
      const lines = [];
      stamper.stampAll(root, { log: (line) => lines.push(line) });
      assert.equal(lines.length, 14);
      assert.ok(lines.every((line) => /^stamp-character: \.claude\/skills\/.+ updated$/.test(line)));
    });
  });
});
