// AC-001 — the recommender must emit a vitest command valid on v4 and tag the suite kind.
//
// RED until .claude/skills/claude-automation-recommender/SKILL.md is amended:
//   `vitest run --reporter=basic` (basic reporter removed in vitest v4) -> `--reporter=dot`,
//   plus the recommended config emits test.kind "behavior" so a fresh vitest install
//   benefits from the docs-only chore verify trap fix.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const RECOMMENDER = join(REPO_ROOT, '.claude/skills/claude-automation-recommender/SKILL.md');

describe('AC-001 — recommender vitest reporter + test.kind', () => {
  const text = readFileSync(RECOMMENDER, 'utf8');

  it('test_when_recommender_vitest_cmd_then_uses_dot_reporter', () => {
    assert.doesNotMatch(
      text,
      /--reporter=basic/,
      'the basic reporter was removed in vitest v4; the recommender must not recommend it',
    );
    assert.match(
      text,
      /vitest run --reporter=dot/,
      'the recommended vitest test_cmd must use --reporter=dot (valid on vitest v4)',
    );
  });

  it('test_when_recommender_vitest_cmd_then_emits_test_kind_behavior', () => {
    assert.match(text, /test[._]kind/i, 'the recommended config must reference the test.kind key');
    assert.match(text, /["']behavior["']/i, 'the recommended config must set test.kind to "behavior"');
  });
});
