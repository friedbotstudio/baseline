// docsite predicate-table completeness — T3 of harden-power-track-debt.
//
// The site-src/workflows.njk §III predicate table drifted from V1_PREDICATES for
// a whole release cycle (missing requires_commit_consent). This pins the table to
// the source of truth. The table is ALREADY correct, so the live-equality test is
// a REGRESSION TRAP (green now, fails if a future predicate lands without its row).
// A detector self-check proves the comparator has teeth on a synthetic drift.
//
// T3 has no production code — this test IS the deliverable (MC-2).

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), '..');

// Foundation: parse the §III predicate rows. Each row is
// `<tr><td class="phase">requires_*</td>...`. Return the set of predicate names.
// Parse the rendered predicate cells, not the template. The page builds the
// section from a `{% for %}` over _data/roster.cjs, so no predicate name appears
// in workflows.njk at all — a template scan would report every predicate missing
// against a correct page. Each predicate is the kicker of its own cell.
// Scoped to the §Preconditions section. The §Invariants section above it also
// carries `requires_`-prefixed kickers (requires_spec, requires_swarm), and those
// are Article IV invariant names, not predicates — a whole-page scan would report
// them as vocabulary drift.
function preconditionsSection(html) {
  const start = html.indexOf('id="preconditions"');
  if (start === -1) return '';
  const rest = html.slice(start);
  const end = rest.indexOf('<h2', 1);
  return end === -1 ? rest : rest.slice(0, end);
}

function njkPredicateSet(html) {
  const out = new Set();
  const re = /<div class="cell-kicker">(requires_[a-z_]+)<\/div>/g;
  let m;
  const section = preconditionsSection(html);
  while ((m = re.exec(section)) !== null) out.add(m[1]);
  return out;
}

// Foundation: the set-difference the completeness check reports.
function predicateDiff(tableSet, vocabSet) {
  const missingFromTable = [...vocabSet].filter((p) => !tableSet.has(p));
  const extraInTable = [...tableSet].filter((p) => !vocabSet.has(p));
  return { missingFromTable, extraInTable };
}

const V1 = (await import(path.join(REPO_ROOT, 'src/cli/workflows-validator-predicates.js'))).V1_PREDICATES;
const njk = readFileSync(path.join(REPO_ROOT, 'obj/site/workflows/index.html'), 'utf8');

describe('the docsite predicate table equals V1_PREDICATES', () => {
  // AC-007 — regression trap: green now, fails on any future drift
  it('test_when_live_njk_table_compared_to_v1_predicates_then_set_equal', () => {
    const tableSet = njkPredicateSet(njk);
    const { missingFromTable, extraInTable } = predicateDiff(tableSet, V1);
    assert.deepEqual(missingFromTable, [], `predicates in V1 but missing from the njk table: ${missingFromTable}`);
    assert.deepEqual(extraInTable, [], `predicates in the njk table but not in V1: ${extraInTable}`);
  });

  // AC-006 — detector self-check: the comparator names a missing predicate
  it('test_when_detector_run_on_synthetic_drift_then_it_reports_the_missing_predicate', () => {
    const full = new Set(V1);
    const dropped = [...full][0];
    const drifted = new Set([...full].filter((p) => p !== dropped));
    const { missingFromTable } = predicateDiff(drifted, V1);
    assert.deepEqual(missingFromTable, [dropped], 'the comparator flags exactly the dropped predicate');
  });
});
