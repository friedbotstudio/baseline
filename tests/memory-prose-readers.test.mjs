// shard-migration-repair — AC-014 (prose consumers of the memory store).
//
// An entire consumer class the first inventory missed: SKILL.md files instruct
// CLAUDE to read and stage paths, and those instructions went stale exactly like
// the code did. The operationally worst is commit/SKILL.md, which directs
// `git add .claude/memory/backlog.md` — a path that no longer exists, so the add
// errors, the closure never stages, and git_commit_guard hard-blocks the commit.
// The code was made shard-aware; the instructions telling Claude what to do were not.
//
// .claude/memory/README.md is the schema authority Article IX cites, and it still
// presents all seven categories as flat files AND documents `status:` as a BODY
// field when the repaired store lifts it to frontmatter.
//
// RED until: all six surfaces describe the sharded shape.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT, CANONICAL_CATEGORIES } from './helpers/memory-fixtures.mjs';

const PROSE_SURFACES = [
  '.claude/skills/commit/SKILL.md',
  '.claude/skills/retrospective/SKILL.md',
  '.claude/skills/memory-sync/SKILL.md',
  '.claude/skills/standup/SKILL.md',
  '.claude/skills/research/SKILL.md',
  '.claude/memory/README.md',
];

// `.claude/memory/<canonical>.md` — the flat path that no longer exists.
const FLAT_PATH_RE = new RegExp(
  String.raw`\.claude/memory/(${CANONICAL_CATEGORIES.join('|')})\.md`,
  'g',
);

function flatPathMentions(rel) {
  const text = readFileSync(join(REPO_ROOT, rel), 'utf8');
  const hits = [];
  text.split('\n').forEach((line, i) => {
    // A line that explicitly contrasts flat-vs-sharded is documentation of the
    // migration, not a stale instruction.
    if (/sharded|shard dir|both shapes|pre-migration|flat store/i.test(line)) return;
    for (const m of line.matchAll(FLAT_PATH_RE)) hits.push(`${rel}:${i + 1} ${m[0]}`);
  });
  return hits;
}

describe('prose readers — no stale flat-path instructions (AC-014)', () => {
  it('test_when_prose_surfaces_scanned_then_no_flat_canonical_path_instructions', () => {
    const stale = PROSE_SURFACES.flatMap(flatPathMentions);
    assert.deepEqual(stale, [],
      `these instructions name a flat canonical path that no longer exists:\n${stale.join('\n')}`);

    const commitSop = readFileSync(join(REPO_ROOT, '.claude/skills/commit/SKILL.md'), 'utf8');
    assert.match(commitSop, /\.claude\/memory\/backlog\//,
      'commit/SKILL.md must direct staging of the sharded entry path so the closure actually stages');

    const readme = readFileSync(join(REPO_ROOT, '.claude/memory/README.md'), 'utf8');
    assert.ok(!/the body `status:` field/i.test(readme),
      'README must not document status: as a body field — the repaired store lifts it to frontmatter');
    assert.match(readme, /frontmatter/i, 'README documents the sharded frontmatter shape');
  });
});
