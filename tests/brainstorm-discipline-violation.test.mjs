// brainstorm-and-codesign — AC-003
//
// Brainstorm Stage 2 dialogue discipline: the discipline-assertor scans each
// model-emitted turn for solution-shaped tokens (implementation verbs,
// library names, "Have you considered using X" patterns). Violations flagged.
//
// SUT: .claude/skills/brainstorm/discipline.mjs

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const HERE = path.dirname(__filename);
const REPO_ROOT = path.resolve(HERE, '..');

let discipline;
try {
  discipline = await import(path.join(REPO_ROOT, '.claude/skills/brainstorm/discipline.mjs'));
} catch (err) {
  throw new Error(
    `.claude/skills/brainstorm/discipline.mjs not yet implemented. Original: ${err.message}`
  );
}

const CONFORMING_PROBES = [
  'Who experiences this problem today? An on-call engineer, a customer, or someone else?',
  'When does this come up? Is it tied to a specific event, time of day, or workflow step?',
  'What does the pain look like in their day-to-day? Walk me through a concrete recent example.',
  'What outcome would feel like success for you?',
  'What is explicitly NOT in scope here?',
];

const VIOLATING_PROBES = [
  'Have you considered using Redis to make this faster?',
  'We could add a retry loop with exponential backoff to handle this.',
  'What if we implement a circuit breaker pattern here?',
  'Should we refactor the worker to use async/await?',
  'I recommend using PostgreSQL for this.',
];

describe('brainstorm Stage 2 dialogue discipline (AC-003)', () => {
  it('test_when_stage2_probe_is_conforming_then_no_violations_flagged', () => {
    for (const probe of CONFORMING_PROBES) {
      const violations = discipline.scanTurn(probe);
      assert.equal(violations.length, 0,
        `conforming probe wrongly flagged: "${probe}" → ${JSON.stringify(violations)}`);
    }
  });

  it('test_when_stage2_probe_contains_solution_shaped_token_then_violation_flagged', () => {
    for (const probe of VIOLATING_PROBES) {
      const violations = discipline.scanTurn(probe);
      assert.ok(violations.length >= 1,
        `violating probe NOT flagged: "${probe}"`);
    }
  });

  it('test_when_probe_contains_library_name_then_violation_flagged', () => {
    const violations = discipline.scanTurn('I recommend using PostgreSQL for this.');
    assert.ok(violations.some((v) => /library|tech|tool/i.test(v.category || '')),
      'library-name violations carry a category tag identifying the kind of leak');
  });
});
