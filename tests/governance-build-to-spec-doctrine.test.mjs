// erp-portables slice DEF (D + E + F) — AC-004, AC-005, AC-006 (prose surface)
//
// Structural anchors for the build-to-spec doctrine across the constitution
// chain and the SOP prose:
//   - CLAUDE.md (+ byte mirror) carries the new XI.12 decision-economy clause
//     and stays under the 40,000-char Art. I.6 cap.
//   - The annex carries the 5.12 detail with the closed human's-call category
//     list, and 5.3 reflects the tightened Stage 2 probe cap (2).
//   - seed.md (+ template mirror) carries the novelty / leanest-track note and
//     the decision-economy note (seed is amended FIRST per Art. I precedence).
//   - workflows.jsonl entry-point rebalance is TEXT-ONLY: intake-full names the
//     genuinely-novel surface, spec-entry names spec-derived/pattern work, and
//     both tracks' node id arrays are byte-identical to the pre-slice DAG.
//   - triage / brainstorm / entry-skill SOPs carry the Step 0 novelty-first,
//     derivation-first, and explicit-skip_brainstorm wording.
//
// RED until /implement lands the prose. Node-id pinning tests are regression
// traps (REGRESSION_TRAP_PRE_PASSING) — the DAG must be unchanged before AND
// after the slice.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const HERE = path.dirname(__filename);
const REPO_ROOT = path.resolve(HERE, '..');

const read = (rel) => readFileSync(path.resolve(REPO_ROOT, rel), 'utf8');

// Article-scoped slice: text between the XI.12 heading and the next heading of
// equal-or-higher rank, so assertions can't false-positive on prose elsewhere.
function sectionOf(text, heading) {
  const start = text.indexOf(heading);
  if (start === -1) return null;
  const rest = text.slice(start + heading.length);
  const next = rest.search(/\n#{2,3} /);
  return heading + (next === -1 ? rest : rest.slice(0, next));
}

// Per-file pins: the live file carries repo-local additions (spec-shippability-
// review, cli-copy-review); the pristine template ships without them.
const PINNED_NODE_IDS = {
  '.claude/workflows.jsonl': {
    'intake-full': ['intake', 'approve-direction', 'scout', 'research', 'spec', 'spec-shippability-review', 'implementation', 'simplify', 'security', 'integrate', 'document', 'archive', 'roadmap-sync', 'memory-sync', 'cli-copy-review', 'grant-commit', 'commit'],
    'spec-entry': ['scout', 'spec', 'spec-shippability-review', 'approve-direction', 'implementation', 'simplify', 'security', 'integrate', 'document', 'archive', 'roadmap-sync', 'memory-sync', 'grant-commit', 'commit'],
  },
  'src/.claude/workflows.template.jsonl': {
    'intake-full': ['intake', 'approve-direction', 'scout', 'research', 'spec', 'implementation', 'simplify', 'security', 'integrate', 'document', 'archive', 'roadmap-sync', 'memory-sync', 'grant-commit', 'commit'],
    'spec-entry': ['scout', 'spec', 'approve-direction', 'implementation', 'simplify', 'security', 'integrate', 'document', 'archive', 'roadmap-sync', 'memory-sync', 'grant-commit', 'commit'],
  },
};

function tracksOf(rel) {
  return read(rel).trim().split('\n').map((l) => JSON.parse(l));
}

describe('XI.12 decision economy in the constitution chain (AC-006)', () => {
  for (const rel of ['CLAUDE.md', 'src/CLAUDE.template.md']) {
    it(`test_when_${rel.replace(/[^\w]/g, '_')}_scanned_then_XI12_clause_present`, () => {
      const text = read(rel);
      const clause = sectionOf(text, '### XI.12');
      assert.ok(clause, `${rel} carries a "### XI.12" section`);
      assert.match(clause, /decision economy/i, 'clause names the doctrine');
      assert.match(clause, /owner: engineer/, 'routine forks are recorded owner: engineer');
      assert.match(clause, /recorded assumption/, 'timeout adopts the recommendation as a recorded assumption');
      assert.match(clause, /consent gate/i, 'consent gates still block');
    });
  }

  it('test_when_CLAUDE_md_measured_then_under_40k_cap', () => {
    assert.ok(Buffer.byteLength(read('CLAUDE.md'), 'utf8') <= 40000,
      'CLAUDE.md stays within the Art. I.6 40,000-char cap after XI.12');
  });

  it('test_when_annex_scanned_then_512_detail_with_closed_category_list', () => {
    const annex = read('.claude/CONSTITUTION.md');
    const detail = sectionOf(annex, '### 5.12');
    assert.ok(detail, 'annex carries a "### 5.12" detail section');
    assert.match(detail, /consent-adjacent/, 'category: consent-adjacent scope');
    assert.match(detail, /irreversible/, 'category: irreversible/destructive ops');
    assert.match(detail, /policy flip/i, 'category: policy flips');
    assert.match(detail, /contradictory requirements/i, 'category: contradictory requirements');
  });

  it('test_when_annex_53_scanned_then_probe_cap_is_2', () => {
    const annex = read('.claude/CONSTITUTION.md');
    const detail = sectionOf(annex, '### 5.3');
    assert.ok(detail, 'annex carries the 5.3 brainstorm detail');
    assert.match(detail, /Stage 2 iteration cap is 2/, 'annex 5.3 reflects cap 5 -> 2');
    assert.doesNotMatch(detail, /Stage 2 iteration cap is 5/, 'stale cap-5 text removed');
  });
});

describe('seed.md doctrine notes — amended FIRST per Art. I (AC-004/AC-005/AC-006)', () => {
  for (const rel of ['docs/init/seed.md', 'src/seed.template.md']) {
    const slug = rel.replace(/[^\w]/g, '_');
    it(`test_when_${slug}_scanned_then_novelty_and_leanest_note_present`, () => {
      const text = read(rel);
      assert.match(text, /pattern-copy/, 'novelty enum named (pattern-copy …)');
      assert.match(text, /leanest/i, 'leanest-safe-track rule named');
      assert.match(text, /track_reason/, 'heavier pick requires a named track_reason');
    });
    it(`test_when_${slug}_scanned_then_decision_economy_note_present`, () => {
      const text = read(rel);
      assert.match(text, /recorded assumption/, 'timeout-adopts-recommendation rule present');
    });
  }
});

describe('workflows.jsonl entry-point rebalance is text-only (AC-004)', () => {
  for (const rel of ['.claude/workflows.jsonl', 'src/.claude/workflows.template.jsonl']) {
    const slug = rel.replace(/[^\w]/g, '_');
    it(`test_when_${slug}_parsed_then_descriptions_rebalanced`, () => {
      const tracks = tracksOf(rel);
      const intakeFull = tracks.find((t) => t.track_id === 'intake-full');
      const specEntry = tracks.find((t) => t.track_id === 'spec-entry');
      assert.ok(intakeFull && specEntry, `${rel} declares intake-full and spec-entry`);
      const intakeText = intakeFull.description + ' ' + (intakeFull.selector_hints || []).join(' ');
      const specText = specEntry.description + ' ' + (specEntry.selector_hints || []).join(' ');
      assert.match(intakeText, /genuinely novel/i,
        'intake-full narrowed to genuinely novel surface');
      assert.match(specText, /spec-derived/i,
        'spec-entry broadened to spec-derived/pattern work');
    });
    it(`test_when_${slug}_parsed_then_node_id_arrays_unchanged`, () => {
      const tracks = tracksOf(rel);
      for (const [trackId, pinned] of Object.entries(PINNED_NODE_IDS[rel])) {
        const track = tracks.find((t) => t.track_id === trackId);
        assert.ok(track, `${rel} declares ${trackId}`);
        assert.deepEqual(track.nodes.map((n) => n.id), pinned,
          `${trackId} DAG drifted. The entry-point rebalance was text-only. Exactly two sanctioned changes have landed since: harness-batch-fixes T6 replaced the bare \`tdd\` node with the \`implementation\` selector so swarm is the default code-generation route, and cycle-time-fixes gave \`spec-entry\` a \`scout\` node ahead of \`spec\` under the seed.md §18.1 amendment, because the track was measuring as the slowest of them all while shipping the smallest diffs. Any other delta is unintended.`);
      }
    });
  }
});

describe('SOP prose carries the doctrine (AC-004/AC-005)', () => {
  it('test_when_triage_skill_scanned_then_step0_novelty_first_present', () => {
    const text = read('.claude/skills/triage/SKILL.md');
    assert.match(text, /Step 0/, 'triage SOP carries a Step 0');
    assert.match(text, /pattern-copy/, 'Step 0 names the novelty enum');
    assert.match(text, /leanest/i, 'Step 0 names the leanest-safe-track rule');
    assert.match(text, /skip_brainstorm/, 'Step 0 writes skip_brainstorm explicitly');
  });

  it('test_when_brainstorm_skill_scanned_then_derivation_first_cap2', () => {
    const text = read('.claude/skills/brainstorm/SKILL.md');
    assert.match(text, /derivation-first/i, 'Stage 1 is derivation-first');
    assert.match(text, /cap[^.\n]*2/i, 'Stage 2 probe cap is 2');
    assert.doesNotMatch(text, /5 in Stage 2/, 'stale cap-5 wording removed');
  });

  for (const rel of ['.claude/skills/intake/SKILL.md', '.claude/skills/spec/SKILL.md', '.claude/skills/tdd/SKILL.md']) {
    const slug = rel.replace(/[^\w]/g, '_');
    it(`test_when_${slug}_scanned_then_entry_gate_wording_present`, () => {
      const text = read(rel);
      assert.match(text, /skip_brainstorm/, `${rel} carries the Step 0.5 gate wording`);
    });
  }
});
