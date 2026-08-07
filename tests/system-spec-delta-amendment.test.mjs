// system-spec-delta slice F (C2-6) — the constitutional amendment.
//
// Cycle 1 (9790ff3) wired the central system spec into the session and the write
// boundary; Cycle 2 slices A through E made a spec declare its delta, taught
// archive to verify it, filled the witness registry, and gave research a
// structural lane. None of that was written down in the governing documents.
// This slice records it: seed.md §4.8/§9/§12 and CLAUDE.md Article IX clause 10.
//
// The interesting constraint is the budget. CLAUDE.md carries a hard character
// ceiling AND a hard byte ceiling, asserted in two DIFFERENT test files, and at
// the time this slice opened there were 84 chars and 57 bytes of slack — less
// than the clause costs. Rollout prerequisite 1 pays for it by relocating two
// pieces of Article IX narration to the annex BEFORE the clause is added. The
// last two tests here are what make "relocate before adding" checkable rather
// than aspirational: one proves the narration moved, the other proves neither
// ceiling was quietly raised to make room.
//
// RED until the amendment lands.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(resolve(REPO_ROOT, rel), 'utf8');

// Scoped-section extraction. An unscoped match would pass on prose anywhere in a
// 38k-character document, which is how a governance test comes to assert nothing.
function sectionBetween(text, startPattern, endPattern) {
  const start = text.search(startPattern);
  assert.notEqual(start, -1, `section start ${startPattern} not found`);
  const rest = text.slice(start);
  const endOffset = rest.slice(1).search(endPattern);
  return endOffset === -1 ? rest : rest.slice(0, endOffset + 1);
}

const articleIX = () => sectionBetween(read('CLAUDE.md'), /^## Article IX\b/m, /^## Article [A-Z]+ /m);
const seedSection = (heading, next) => sectionBetween(read('docs/init/seed.md'), heading, next);

describe('AC-012 — the recall rule is recorded in the governing documents', () => {
  it('test_when_claude_md_article_ix_is_read_then_clause_10_carries_the_recall_rule', () => {
    const article = articleIX();

    const clause10 = sectionBetween(article, /^10\. /m, /^(?:11\. |Memory accelerates)/m);
    assert.ok(clause10.length > 0, 'Article IX must carry a clause 10');

    assert.match(clause10, /concept/i, 'clause 10 must name descending by concept');
    assert.match(clause10, /touched path/i, 'clause 10 must name walking up from the touched paths');
    assert.match(clause10, /rediscover/i, 'clause 10 must say this happens before rediscovering');
    assert.match(clause10, /map routes/i, 'clause 10 must state that the map routes');
    assert.match(clause10, /code witnesses/i, 'clause 10 must state that the code witnesses');
    assert.match(
      clause10,
      /unwitnessed shard[\s\S]*never evidence/i,
      'clause 10 must state that an unwitnessed shard routes and is never evidence'
    );
  });

  it('test_when_seed_md_4_8_is_read_then_it_carries_the_recall_clause', () => {
    const s = seedSection(/^### §4\.8 /m, /^(?:### §4\.\d|## §5)/m);

    assert.match(s, /recall/i, '§4.8 must name recall');
    assert.match(
      s,
      /(concept|walk up|touched path)/i,
      '§4.8 must describe the descend-by-concept / walk-up-from-touched-path entry points'
    );
    assert.match(
      s,
      /session[- ]start/i,
      '§4.8 must state the session-start concept map claim, which Cycle 1 made true'
    );
  });

  it('test_when_seed_md_9_is_read_then_the_system_delta_is_a_required_spec_section', () => {
    const s = seedSection(/^## §9 /m, /^## §10 /m);

    assert.match(s, /System delta/i, '§9 must name the System delta section');
    assert.match(s, /required/i, '§9 must state that the delta is a required spec section');
    assert.match(
      s,
      /reference/i,
      '§9 must keep the element-reference affordance alongside the requirement, not replace it'
    );
  });

  it('test_when_seed_md_12_is_read_then_archive_verifies_a_declared_delta_rather_than_only_restamping', () => {
    const s = seedSection(/^## §12 /m, /^## §13 /m);

    assert.match(s, /verif/i, '§12 must state that archive verifies the declared delta');
    assert.match(s, /declared delta|delta/i, '§12 must name the declared delta');
    assert.match(
      s,
      /confirm/i,
      '§12 must state that only confirmed rows are applied'
    );
    assert.match(
      s,
      /bulk-refresh|permanently green/i,
      '§12 must keep the no-bulk-refresh rule that the digest exists to enforce'
    );
  });
});

describe('AC-012 via Rollout prerequisite 1 — the budget is paid by relocation, not by raising a ceiling', () => {
  it('test_when_the_relocated_narration_is_sought_then_it_lives_in_the_annex_and_not_in_claude_md', () => {
    const article = articleIX();
    const annex = read('.claude/CONSTITUTION.md');

    // Clause 3: the inbox MECHANICS move; the binding kernel stays.
    assert.match(article, /_pending\.md/, 'clause 3 keeps its binding kernel naming _pending.md');
    assert.match(article, /memory-flush/, 'clause 3 keeps the promote-only-via-/memory-flush rule');
    assert.ok(
      !/natural byproduct/i.test(article),
      'the clause 3 natural-byproduct narration must move to the annex'
    );
    assert.match(
      annex,
      /natural byproduct/i,
      'the annex must receive the clause 3 natural-byproduct narration'
    );

    // Clause 5: the size-cap RATIONALE moves; the binding kernel stays.
    assert.match(article, /size-cap/i, 'clause 5 keeps its binding size-cap rule');
    assert.match(article, /30 (commits|days)/i, 'clause 5 keeps the staleness threshold');
    assert.ok(
      !/prune oldest/i.test(article),
      'the clause 5 prune-oldest-on-overflow rationale must move to the annex'
    );
    assert.match(
      annex,
      /prune oldest/i,
      'the annex must receive the clause 5 prune-oldest rationale'
    );
    assert.match(
      annex,
      /sharded shape has no per-file cap/i,
      'the annex must receive the sharded-shape carve-out from clause 5'
    );
  });

  it('test_when_the_budget_is_measured_then_claude_md_fits_both_ceilings_and_neither_was_raised', () => {
    const chars = read('CLAUDE.md').length;
    const bytes = readFileSync(resolve(REPO_ROOT, 'CLAUDE.md')).length;

    assert.ok(chars <= 38800, `CLAUDE.md is ${chars} chars, over the 38800 ceiling`);
    assert.ok(bytes <= 39000, `CLAUDE.md is ${bytes} bytes, over the 39000 ceiling`);

    // The escape this scenario exists to forbid: fitting the amendment by moving
    // the goalposts. Both ceilings are asserted in other files; they must still
    // read the same numbers after this slice.
    assert.match(
      read('tests/gitignore-governance-cascade.test.mjs'),
      /length <= 38800/,
      'the 38800 character ceiling must not be raised to fit the amendment'
    );
    assert.match(
      read('tests/code-browser-primary-navigation.test.mjs'),
      /CLAUDE_TARGET_MAX = 39000/,
      'the 39000 byte ceiling must not be raised to fit the amendment'
    );
  });
});
