// The audit check that turns the doctrine into a verdict.
//
// Every case builds a throwaway tree rather than mutating the repo: the check reads
// ctx.root, and a test that stamped the live tree would make the drift case pass by
// repairing the very drift it is meant to catch.

import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, readdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { REPO_ROOT, readFileSync, tryImport } from './helpers/memory-fixtures.mjs';

const CHECK = '.claude/skills/audit-baseline/checks/skill-character.mjs';
const RENDER = '.claude/skills/audit-baseline/character.mjs';

let check;
let render;
before(async () => {
  check = await tryImport(CHECK);
  render = await tryImport(RENDER);
  assert.ok(check, `${CHECK} must exist — it is the enforcement point for AC-002 through AC-004`);
  assert.ok(render, `${RENDER} must exist`);
});

function buildTree({ omit = [], mutate = null, doctrine = null } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'charaudit-'));
  const auditDir = join(root, '.claude', 'skills', 'audit-baseline');
  mkdirSync(auditDir, { recursive: true });
  const source = doctrine ?? readFileSync(join(REPO_ROOT, '.claude/skills/audit-baseline/character.json'), 'utf8');
  writeFileSync(join(auditDir, 'character.json'), source);

  for (const [slug, entry] of Object.entries(render.loadDoctrine(REPO_ROOT).skills)) {
    if (omit.includes(slug)) continue;
    const dir = join(root, '.claude', 'skills', slug);
    mkdirSync(dir, { recursive: true });
    const base = ['---', `name: ${slug}`, 'owner: baseline', '---', '', `# ${slug}`, ''].join('\n');
    writeFileSync(join(dir, 'SKILL.md'), mutate?.(slug, base, entry) ?? stamped(base, entry));
  }
  return root;
}

function stamped(base, entry) {
  return render.stampSkill(base, render.renderBlock(entry));
}

function ctxFor(root) {
  return { root, skipHashCheck: true, readSkillOwner: () => 'baseline', loadManifest: () => null };
}

function fails(rows) {
  return rows.filter((row) => row[1] === 'FAIL');
}

function withTree(options, assertion) {
  const root = buildTree(options);
  try { assertion(root); } finally { rmSync(root, { recursive: true, force: true }); }
}

describe('skill-character audit check', () => {
  it('test_when_all_targets_stamped_then_check_emits_no_fail_row', () => {
    // Covers AC-001, AC-002.
    withTree({}, (root) => assert.deepEqual(fails(check.run(ctxFor(root))), []));
  });

  it('test_when_block_missing_then_check_fails_naming_the_skill', () => {
    // Covers AC-002.
    withTree({ mutate: (slug, base, entry) => (slug === 'integrate' ? base : stamped(base, entry)) }, (root) => {
      const rows = fails(check.run(ctxFor(root)));
      assert.equal(rows.length, 1);
      assert.match(rows[0].join(' '), /integrate/);
    });
  });

  it('test_when_block_part_missing_then_check_fails_naming_skill_and_part', () => {
    // Covers AC-003.
    const drop = (slug, base, entry) => (slug !== 'security'
      ? stamped(base, entry)
      : stamped(base, entry).split('\n').filter((line) => !line.startsWith('- **Mantra.**')).join('\n'));
    withTree({ mutate: drop }, (root) => {
      const rows = fails(check.run(ctxFor(root)));
      assert.equal(rows.length, 1);
      assert.match(rows[0].join(' '), /security/);
      assert.match(rows[0].join(' '), /mantra/i);
    });
  });

  it('test_when_temperament_bullet_removed_then_check_fails_naming_temperament', () => {
    // Covers AC-004. The missing-part scan reads the imported PARTS, so a field added
    // to the doctrine is enforced here the moment it is added there — no second list.
    const drop = (slug, base, entry) => (slug !== 'tdd'
      ? stamped(base, entry)
      : stamped(base, entry).split('\n').filter((line) => !line.startsWith('- **Temperament.**')).join('\n'));
    withTree({ mutate: drop }, (root) => {
      const rows = fails(check.run(ctxFor(root)));
      assert.equal(rows.length, 1);
      assert.match(rows[0].join(' '), /tdd/);
      assert.match(rows[0].join(' '), /temperament/i);
    });
  });

  it('test_when_voice_text_hand_edited_then_check_fails_naming_drift', () => {
    // Covers AC-005. A hand-edited new field drifts exactly like a hand-edited old one.
    const edit = (slug, base, entry) => (slug !== 'scenario'
      ? stamped(base, entry)
      : stamped(base, { ...entry, voice: 'A sentence a human typed over the doctrine.' }));
    withTree({ mutate: edit }, (root) => {
      const rows = fails(check.run(ctxFor(root)));
      assert.equal(rows.length, 1);
      assert.match(rows[0].join(' '), /scenario/);
      assert.match(rows[0].join(' '), /drift/i);
    });
  });

  it('test_when_block_drifted_then_check_fails_naming_drift', () => {
    // Covers AC-004.
    const edit = (slug, base, entry) => (slug !== 'spec'
      ? stamped(base, entry)
      : stamped(base, { ...entry, soul: 'Something a human typed in by hand.' }));
    withTree({ mutate: edit }, (root) => {
      const rows = fails(check.run(ctxFor(root)));
      assert.equal(rows.length, 1);
      assert.match(rows[0].join(' '), /spec/);
      assert.match(rows[0].join(' '), /drift/i);
      const onDisk = readFileSync(join(root, '.claude/skills/spec/SKILL.md'), 'utf8');
      assert.ok(
        onDisk.includes('Something a human typed in by hand.'),
        'the check is read-only — reporting drift must never repair it, or the report becomes unfalsifiable',
      );
    });
  });

  it('test_when_skill_not_in_doctrine_then_check_emits_no_row', () => {
    // Covers AC-006.
    withTree({}, (root) => {
      const dir = join(root, '.claude', 'skills', 'roadmap-sync');
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, 'SKILL.md'), '---\nname: roadmap-sync\nowner: baseline\n---\n\n# roadmap-sync\n');
      const rows = check.run(ctxFor(root));
      assert.equal(rows.filter((row) => row.join(' ').includes('roadmap-sync')).length, 0);
    });
  });

  it('test_when_doctrine_slug_dir_absent_then_check_emits_no_row', () => {
    // Covers AC-007.
    withTree({ omit: ['simplify'] }, (root) => {
      const rows = check.run(ctxFor(root));
      assert.equal(
        rows.filter((row) => row.join(' ').includes('simplify')).length, 0,
        'missing-skill detection belongs to checks/skill-ownership.mjs — two checks reporting it means two places to fix it',
      );
    });
  });

  it('test_when_doctrine_unreadable_then_check_emits_one_fail_row_without_throwing', () => {
    // Covers AC-001.
    for (const body of [null, '{ "skills": ']) {
      const root = mkdtempSync(join(tmpdir(), 'charaudit-bad-'));
      mkdirSync(join(root, '.claude', 'skills', 'audit-baseline'), { recursive: true });
      if (body !== null) writeFileSync(join(root, '.claude/skills/audit-baseline/character.json'), body);
      try {
        const rows = check.run(ctxFor(root));
        assert.equal(fails(rows).length, 1);
      } finally { rmSync(root, { recursive: true, force: true }); }
    }
  });

  it('test_when_doctrine_key_traverses_then_check_reports_it_and_reads_nothing', () => {
    // Covers AC-026.
    const root = mkdtempSync(join(tmpdir(), 'charaudit-evil-'));
    mkdirSync(join(root, '.claude', 'skills', 'audit-baseline'), { recursive: true });
    writeFileSync(
      join(root, '.claude/skills/audit-baseline/character.json'),
      JSON.stringify({ version: 1, skills: { '../../ELSEWHERE': { soul: 'a', motivation: 'b', mantra: 'c' } } }),
    );
    try {
      const rows = check.run(ctxFor(root));
      assert.equal(fails(rows).length, 1, 'a traversing key is a FAIL row, never a silent skip');
      assert.match(rows[0].join(' '), /slug/i);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it('test_when_spec_is_archived_then_doctrine_audit_still_passes', () => {
    // Covers AC-001, repointed for AC-010.
    //
    // This read `docs/specs/skill-character-doctrine.md`, which `/archive` moves to
    // `docs/archive/<date>/<slug>/` by design — so the test failed with ENOENT after
    // every workflow that archived its own spec, including the one that introduced
    // it. A workflow artifact is not an oracle; it is scheduled to disappear.
    //
    // The doctrine and the skills it names are both live, both shipped, and both
    // survive archival. Comparing them asserts the same invariant against state
    // that is still there tomorrow.
    const inDoctrine = new Set(Object.keys(render.loadDoctrine(REPO_ROOT).skills));
    const onDisk = new Set(
      readdirSync(join(REPO_ROOT, '.claude/skills'))
        .filter((slug) => {
          const skillMd = join(REPO_ROOT, '.claude/skills', slug, 'SKILL.md');
          return existsSync(skillMd) && readFileSync(skillMd, 'utf8').includes('character:begin');
        }),
    );

    assert.deepEqual([...inDoctrine].sort(), [...onDisk].sort(),
      'every skill the doctrine names must carry a character block, and no skill may ' +
      'carry one the doctrine does not name — drift either way is the defect');
  });
});
