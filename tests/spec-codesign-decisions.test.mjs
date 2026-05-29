// brainstorm-and-codesign — AC-005, AC-006
//
// /spec codesign mode Step 1.5: identify N decision points from research+scout,
// propose+rationale per point, AskUserQuestion (Approve / Suggest alt / Discuss),
// capture engineer verbatim as > markdown blockquote in ## Decisions section.
//
// SUT: .claude/skills/spec/decision-finder.mjs
//      .claude/skills/spec/decisions-writer.mjs
//
// RED until /implement creates the helpers.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const HERE = path.dirname(__filename);
const REPO_ROOT = path.resolve(HERE, '..');

let decisionFinder;
let decisionsWriter;
try {
  decisionFinder = await import(path.join(REPO_ROOT, '.claude/skills/spec/decision-finder.mjs'));
  decisionsWriter = await import(path.join(REPO_ROOT, '.claude/skills/spec/decisions-writer.mjs'));
} catch (err) {
  throw new Error(
    `.claude/skills/spec/decision-finder.mjs or decisions-writer.mjs not yet implemented (RED expected pre-/implement). ` +
    `Original import error: ${err.message}`
  );
}

const RESEARCH_WITH_TWO_FORKS = `# Pattern Research

## Candidate A: classical CV pipeline
- Tradeoffs: faster but less robust to lighting

## Candidate B: deep learning encoder
- Tradeoffs: robust but heavy

## Recommendation
Candidate A unless lighting variance > 30%.
`;

describe('/spec codesign mode (AC-005, AC-006)', () => {
  it('test_when_spec_codesign_mode_true_identifies_decisions_and_captures_verbatim', () => {
    const decisions = decisionFinder.findDecisionPoints({
      researchMemo: RESEARCH_WITH_TWO_FORKS,
      scoutReport: '',
    });
    assert.ok(Array.isArray(decisions), 'returns an array');
    assert.ok(decisions.length >= 1, 'identifies at least 1 decision point from a research memo with explicit forks');

    const fakeEngineerOverride = {
      decision_name: 'CV approach',
      chosen: 'deep learning encoder',
      verbatim: 'We need robustness to lighting; the deployment site has skylights and the lighting variance is closer to 40%.',
      claudes_recommendation: 'classical CV pipeline',
      options_considered: ['classical CV pipeline', 'deep learning encoder'],
      dismissed_alternatives: [{ option: 'classical CV pipeline', reason: 'fails on lighting variance > 30%' }],
    };
    const md = decisionsWriter.writeDecisionsSection([fakeEngineerOverride]);
    assert.ok(/^## Decisions/m.test(md), 'output starts with ## Decisions heading');
    assert.ok(/^### Decision: CV approach/m.test(md), 'decision entry has ### name heading');
    assert.ok(/^> We need robustness/m.test(md), 'engineer verbatim rendered as > blockquote');
    assert.ok(md.includes('deep learning encoder'), 'chosen option is engineer pick (not Claude rec)');
    assert.ok(!new RegExp(`Chosen:\\s*classical`, 'm').test(md),
      'when engineer overrides, Claude rec must NOT appear as chosen');
  });
});
