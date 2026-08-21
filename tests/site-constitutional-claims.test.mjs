// The site's credibility argument is that every claim is checkable against the
// repository. Two claims drifted anyway, and neither drift was noisy:
//
//   1. Every page asserted FOUR consent gates. CLAUDE.md Art. IV names three and
//      says in as many words that `/grant-push` is Bash-time push consent, not a
//      gate. `_data/baseline.cjs` carried a hardcoded `gates: 4` — the sum of
//      `phaseGates` and `runtimeGates` — and three templates reached for it.
//   2. The intake-full diagram numbered its nodes 04 -> 06, visibly skipping 05,
//      directly beneath an H2 asserting that no phase can be skipped.
//
// Both are the same class of defect: a rendered number that no longer agrees
// with the constitution, on a page that invites the reader to go and check.

import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { ensureSiteBuilt, renderedPages, readRendered, REPO_ROOT } from './helpers/site-build.mjs';

const read = (rel) => readFileSync(path.join(REPO_ROOT, rel), 'utf8');

// CLAUDE.md is the authority. Parsed rather than hardcoded so that amending the
// constitution moves this test with it instead of leaving it asserting history.
function constitutionalGateCount() {
  const m = read('CLAUDE.md').match(/The (three|four|five) consent gates/i);
  assert.ok(m, 'CLAUDE.md must state the consent-gate count in words');
  return { three: 3, four: 4, five: 5 }[m[1].toLowerCase()];
}

let pages = [];

describe('the site never asserts a count the constitution rejects', () => {
  before(() => {
    ensureSiteBuilt();
    pages = renderedPages();
  });

  it('test_when_baseline_data_read_then_it_exposes_no_summed_gate_count', () => {
    const data = read('site-src/_data/baseline.cjs');
    assert.doesNotMatch(
      data,
      /^\s*gates\s*:/m,
      'a summed `gates` adds /grant-push to the three consent gates, which CLAUDE.md Art. IV rejects; '
      + 'templates must reach for `phaseGates` or `runtimeGates` so the wrong number is unreachable',
    );
    assert.match(data, /phaseGates\s*:\s*\d+/, 'phaseGates must remain available to templates');
  });

  it('test_when_phase_gates_read_then_it_equals_the_constitutions_consent_gate_count', () => {
    const declared = Number(read('site-src/_data/baseline.cjs').match(/phaseGates\s*:\s*(\d+)/)[1]);
    assert.equal(
      declared,
      constitutionalGateCount(),
      'site-src/_data/baseline.cjs -> phaseGates must equal the consent-gate count CLAUDE.md Art. IV names',
    );
  });

  it('test_when_rendered_pages_scanned_then_no_page_claims_a_wrong_consent_gate_count', () => {
    const expected = constitutionalGateCount();
    const CLAIM = /(\d+)\s+consent gates/gi;
    const wrong = [];
    for (const rel of pages) {
      for (const m of readRendered(rel).matchAll(CLAIM)) {
        if (Number(m[1]) !== expected) wrong.push(`${rel}: "${m[0]}"`);
      }
    }
    assert.deepEqual(
      wrong,
      [],
      `every rendered "N consent gates" must read ${expected}; /grant-push is not one of them`,
    );
  });

  // The rendered-page scan above ran green while README.md said "4 consent gates"
  // two paragraphs under a tagline of its own saying three. The site is templated
  // and the README is not, so nothing carried the correction across. Both the
  // numeral and the spelled-out form are checked: the README uses each once.
  it('test_when_repo_markdown_scanned_then_no_file_claims_a_wrong_consent_gate_count', () => {
    const expected = constitutionalGateCount();
    const WORDS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6 };
    const CLAIM = /(\d+|one|two|three|four|five|six)\s+consent gates/gi;
    const wrong = [];
    for (const rel of ['README.md', 'PRODUCT.md']) {
      for (const m of read(rel).matchAll(CLAIM)) {
        const claimed = WORDS[m[1].toLowerCase()] ?? Number(m[1]);
        if (claimed !== expected) wrong.push(`${rel}: "${m[0]}"`);
      }
    }
    assert.deepEqual(
      wrong,
      [],
      `every "N consent gates" in repo markdown must read ${expected}; /grant-push is not one of them`,
    );
  });

  it('test_when_the_intake_full_diagram_is_read_then_its_phase_ordinals_have_no_gap', () => {
    const svg = read('site-src/_includes/diagram-flow.njk');
    // Whole-number phase nodes only: 10.5 / 10.6 / 10.7 are sub-phases and are
    // deliberately outside the 1..11 run the headline claim is about.
    const ordinals = [...svg.matchAll(/>(\d{1,2}) [a-z]/g)]
      .map((m) => Number(m[1]))
      .filter((n) => Number.isInteger(n));
    const seen = [...new Set(ordinals)].sort((a, b) => a - b);

    assert.ok(seen.length > 0, 'the diagram must carry numbered phase nodes');
    const missing = [];
    for (let n = seen[0]; n <= seen[seen.length - 1]; n += 1) {
      if (!seen.includes(n)) missing.push(n);
    }
    assert.deepEqual(
      missing,
      [],
      'the diagram illustrates "none can be skipped", so a visible ordinal gap reads as a skipped phase',
    );
  });

  it('test_when_the_intake_full_diagram_is_read_then_both_layouts_carry_the_same_phases', () => {
    const svg = read('site-src/_includes/diagram-flow.njk');
    const [wide, stack] = svg.split('dg dg-stack');
    assert.ok(stack, 'the diagram must ship both a wide and a stacked layout');
    const phases = (chunk) => [...new Set(
      [...chunk.matchAll(/>((?:\d{1,2}(?:\.\d)?) [a-z-]+)</g)].map((m) => m[1]),
    )].sort();
    assert.deepEqual(
      phases(stack),
      phases(wide),
      'a reader on a phone must see the same phases as a reader on a desktop',
    );
  });
});
