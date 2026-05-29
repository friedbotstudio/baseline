// brainstorm-and-codesign — AC-005 boundary
//
// When codesign_mode is true but the decision-point-finder returns zero
// candidates, /spec writes ## Decisions section with body "*(none)*" — the
// heading is still present (artifact_template_guard requires it) but no
// AskUserQuestion fires.
//
// SUT: .claude/skills/spec/decision-finder.mjs
//      .claude/skills/spec/decisions-writer.mjs

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
    `.claude/skills/spec/decision-finder.mjs or decisions-writer.mjs not yet implemented. ` +
    `Original: ${err.message}`
  );
}

const RESEARCH_WITH_NO_FORKS = `# Pattern Research

## Recommendation
A single approach. No alternatives need consideration.
`;

describe('codesign zero-decision boundary (AC-005 boundary)', () => {
  it('test_when_codesign_finds_zero_decisions_then_empty_section_written', () => {
    const decisions = decisionFinder.findDecisionPoints({
      researchMemo: RESEARCH_WITH_NO_FORKS,
      scoutReport: '',
    });
    assert.equal(decisions.length, 0, 'finder returns empty array when no forks present');

    const md = decisionsWriter.writeDecisionsSection(decisions);
    assert.ok(/^## Decisions/m.test(md), '## Decisions heading still present');
    assert.ok(/\*\(none\)\*/.test(md), 'body is *(none)* when no decisions');
    assert.ok(!/^### Decision:/m.test(md), 'no decision entries when array is empty');
  });
});
