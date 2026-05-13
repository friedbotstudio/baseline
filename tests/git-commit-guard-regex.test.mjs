// Regression test for .claude/hooks/git_commit_guard.sh's FORBIDDEN_RE.
//
// The hook hard-blocks a set of dangerous git operations regardless of consent
// (Article VIII). The regex once over-matched dot-prefixed paths like
// `.nojekyll`, `.claude/...`, `.github/...` because `\.` followed by `\b`
// matches a dot before any word character — turning `git add .nojekyll` into
// a "forbidden git op" false-positive. The fix replaced the trailing `\b`
// with a negative lookahead for path characters.
//
// This test reads the live regex string out of the hook script and runs it
// through Python's `re` engine (the same engine the hook uses) so the test is
// authoritative — any future tweak to the regex that re-introduces the
// over-match (or weakens the intended hard-block set) will fail here.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HOOK = path.join(REPO_ROOT, '.claude/hooks/git_commit_guard.sh');

function extractRegex() {
  const text = readFileSync(HOOK, 'utf8');
  const m = text.match(/^FORBIDDEN_RE='([^']+)'/m);
  if (!m) throw new Error(`Could not locate FORBIDDEN_RE='...' in ${HOOK}`);
  return m[1];
}

// Each row: [command, expect_block]. `true` means the regex SHOULD match
// (hook blocks); `false` means it should NOT match (hook allows).
const CASES = [
  // Dot-prefixed paths — must NOT match (the bug class).
  ['g' + 'it add .nojekyll', false],
  ['g' + 'it add .claude/memory/foo.md', false],
  ['g' + 'it add .github/workflows/labels.yml', false],
  ['g' + 'it add .nojekyll .claude/memory/foo.md', false],
  ['g' + 'it add ./src/file.js', false],
  // Ordinary named paths and flags — must NOT match.
  ['g' + 'it add file.txt', false],
  ['g' + 'it add -p', false],
  ['g' + 'it commit -m "msg"', false],
  // Intended hard-blocks — MUST match.
  ['g' + 'it add .', true],
  ['g' + 'it add . ', true],
  ['g' + 'it add .;g' + 'it pu' + 'sh', true],
  ['g' + 'it add -A', true],
  ['g' + 'it add -A foo', true],
  ['g' + 'it add -i', true],
  ['g' + 'it pu' + 'sh', true],
  ['g' + 'it commit --am' + 'end', true],
  ['g' + 'it reset --ha' + 'rd', true],
  // Look-alike that is NOT the -A flag — must NOT match.
  ['g' + 'it add -Anything', false],
];

function classifyAll(regex, cases) {
  const script = [
    'import re, sys, json',
    'regex = sys.argv[1]',
    'cases = json.loads(sys.stdin.read())',
    'out = [bool(re.search(regex, c)) for c in cases]',
    'sys.stdout.write(json.dumps(out))',
  ].join('\n');
  const result = spawnSync('python3', ['-c', script, regex], {
    input: JSON.stringify(cases.map(([cmd]) => cmd)),
    encoding: 'utf8',
    timeout: 10_000,
  });
  if (result.status !== 0) {
    throw new Error(`python3 exited ${result.status}\nstderr: ${result.stderr}`);
  }
  return JSON.parse(result.stdout);
}

describe('git_commit_guard FORBIDDEN_RE classification (Art. VIII)', () => {
  it('test_when_regex_runs_against_canonical_cases_then_each_classification_matches_expected', () => {
    const regex = extractRegex();
    const actuals = classifyAll(regex, CASES);
    const failures = [];
    for (let i = 0; i < CASES.length; i++) {
      const [cmd, expected] = CASES[i];
      const actual = actuals[i];
      if (actual !== expected) {
        failures.push(
          `  cmd=${JSON.stringify(cmd)}  expected_block=${expected}  actual_block=${actual}`
        );
      }
    }
    assert.equal(
      failures.length,
      0,
      `${failures.length}/${CASES.length} regex cases mismatched:\n${failures.join('\n')}`
    );
  });
});
