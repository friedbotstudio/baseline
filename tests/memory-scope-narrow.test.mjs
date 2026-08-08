// Scenarios for the narrowing proposal — AC-003 and AC-008 of
// docs/specs/memory-scope-per-entry.md. Covers §Behavior #2.
//
// The proposal exists because neither pure mechanism reaches the whole problem:
// deriving from `governs:` covers 58 of 305 entries, and hand-curating 136 in one
// diff is unreviewable. proposeNarrowing reports evidence + confidence so the
// reviewer checks the RULE rather than re-deriving each judgment. It decides
// nothing — main context confirms every proposal (Article II).
//
// RED until proposeNarrowing lands in .claude/skills/memory-index/scope-narrow.mjs.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync } from 'node:fs';
import { makeProject, writeShard, tryImport, everyShardFile, readFileSync } from './helpers/memory-fixtures.mjs';

const NARROW = '.claude/skills/memory-index/scope-narrow.mjs';
const RESOLVE = '.claude/skills/memory-index/resolve.mjs';

// The five-phase value SCOPE_BY_CATEGORY stamps on every migrated landmine.
const LANDMINE_CATEGORY_DEFAULT = ['scout', 'spec', 'tdd', 'security', 'integrate'];

async function loadNarrow() {
  const mod = await tryImport(NARROW);
  assert.ok(mod, `${NARROW} must be importable`);
  return mod;
}

function frozenEntry(fields) {
  return Object.freeze({
    key: fields.key,
    category: fields.category ?? 'landmines',
    fields: Object.freeze({ ...fields }),
    body: fields.body ?? '',
  });
}

describe('memory scope — proposeNarrowing reports evidence and decides nothing (AC-003)', () => {
  it('test_when_entry_has_resolvable_governs_then_proposal_is_high_confidence', async () => {
    const { proposeNarrowing } = await loadNarrow();
    const entry = frozenEntry({
      key: 'guard-substrate-lesson',
      category: 'decisions',
      governs: ['.claude/hooks/lib/scoped-memory.mjs'],
    });

    const proposal = proposeNarrowing(entry);

    assert.equal(proposal.key, 'guard-substrate-lesson');
    assert.ok(proposal.proposed_governs.length > 0, 'a resolvable governs: glob yields a non-empty proposal');
    assert.equal(proposal.confidence, 'high');
    assert.match(
      proposal.evidence,
      /scoped-memory\.mjs/,
      'the evidence string names the glob it derived from, so the reviewer can check the rule rather than trust the verdict',
    );
  });

  it('test_when_entry_has_no_evidence_then_proposal_is_low_confidence_and_empty', async () => {
    const { proposeNarrowing } = await loadNarrow();
    const entry = frozenEntry({ key: 'opaque-fact-9f4f', category: 'conventions', body: 'No path, no glob, no anchor.' });

    const proposal = proposeNarrowing(entry);

    assert.equal(proposal.confidence, 'low');
    assert.deepEqual(proposal.proposed_scope, [], 'no evidence yields no proposed scope rather than a guess');
    assert.deepEqual(proposal.proposed_governs, []);
  });

  it('test_when_proposeNarrowing_runs_then_it_performs_no_store_write', async () => {
    const { memDir, root } = makeProject();
    writeShard(memDir, 'landmines', 'untouched', {
      key: 'untouched',
      fields: { scope: '[spec]' },
      bodyLines: ['> verbatim (test, 2026-08-08):', '> body that must not change'],
    });
    const before = everyShardFile(memDir).map((f) => [f, readFileSync(f, 'utf8')]);

    // Read-only root: a helper that reaches for a write fails loudly here rather
    // than silently succeeding and leaving the purity claim untested.
    chmodSync(root, 0o500);
    try {
      const { proposeNarrowing } = await loadNarrow();
      const proposal = proposeNarrowing(frozenEntry({ key: 'untouched', governs: ['.claude/hooks/**'] }));
      assert.ok(proposal, 'the helper still returns a proposal against an unwritable root');
    } finally {
      chmodSync(root, 0o700);
    }

    const after = everyShardFile(memDir).map((f) => [f, readFileSync(f, 'utf8')]);
    assert.deepEqual(after, before, 'proposeNarrowing is pure — it proposes, main context decides and writes');
  });
});

describe('memory scope — the category default is never re-inherited (AC-008)', () => {
  it('test_when_promotion_scope_equals_category_default_without_evidence_then_rejected', async () => {
    const mod = await tryImport(RESOLVE);
    assert.ok(mod, `${RESOLVE} must be importable`);
    const { assertWritable } = mod;

    const inherited = {
      key: 'freshly-promoted-landmine',
      category: 'landmines',
      fields: { key: 'freshly-promoted-landmine', category: 'landmines', scope: LANDMINE_CATEGORY_DEFAULT, governs: [] },
    };

    assert.throws(
      () => assertWritable(inherited),
      /freshly-promoted-landmine/,
      'a promotion whose scope is exactly SCOPE_BY_CATEGORY[category] with no evidence row is refused — the category default is what produced the 49-entry noise this spec removes',
    );
  });
});
