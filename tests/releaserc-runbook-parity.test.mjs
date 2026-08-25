// release-safety-2026-08-25 T4 + T5 — AC-007, AC-008, AC-009, AC-010, AC-026, AC-027.
//
// The runbook's bump table said `feat!:` bumps major. `.releaserc.json` carries
// {breaking: true, release: "minor"}, added deliberately in 0682a28 as a 0.x alpha
// safety belt. Nothing noticed the doc had gone stale, and it mattered the moment
// an unreleased set contained the first `!` commit since: a reader following the
// runbook predicts 1.0.0 and gets 0.26.0.
//
// Correcting the prose is the visible half. These tests are the half that matters —
// the two files can no longer disagree silently.
//
// The same shape covers the scope contract: `site-src` was demoted nowhere and
// documented nowhere, and the only reason anyone noticed is that a commit used it.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { REPO_ROOT } from './helpers/memory-fixtures.mjs';

const RUNBOOK = join(REPO_ROOT, 'docs', 'runbooks', 'npm-publish.md');
const RELEASERC = join(REPO_ROOT, '.releaserc.json');

const readRunbook = () => readFileSync(RUNBOOK, 'utf8');
const readReleaserc = () => JSON.parse(readFileSync(RELEASERC, 'utf8'));

// Line-based rather than a markdown parser: this project ships zero runtime
// dependencies, and the table shape is repository-controlled.
function tableRows(text, headerCell) {
  const lines = text.split('\n');
  const start = lines.findIndex((line) => line.startsWith('|') && line.includes(headerCell));
  if (start < 0) return [];
  const rows = [];
  for (let i = start + 2; i < lines.length; i++) {
    if (!lines[i].startsWith('|')) break;
    rows.push(lines[i].split('|').slice(1, -1).map((cell) => cell.trim()));
  }
  return rows;
}

function commitAnalyzerRules(releaserc) {
  const plugin = (releaserc.plugins || []).find(
    (entry) => Array.isArray(entry) && entry[0] === '@semantic-release/commit-analyzer',
  );
  return (plugin && plugin[1] && plugin[1].releaseRules) || [];
}

function demotedScopes(releaserc) {
  return commitAnalyzerRules(releaserc)
    .filter((rule) => rule.release === false && typeof rule.scope === 'string')
    .map((rule) => rule.scope)
    .sort();
}

function breakingRelease(releaserc) {
  const rule = commitAnalyzerRules(releaserc).find((entry) => entry.breaking === true);
  return rule ? rule.release : null;
}

// Rules that PROMOTE — a type or scope the preset would publish nothing for, or
// would publish less for. `breaking` has its own reader above; these are the ones
// keyed on `type` or `scope` alone.
function promotingRules(releaserc) {
  return commitAnalyzerRules(releaserc).filter(
    (rule) => typeof rule.release === 'string' && rule.breaking === undefined,
  );
}

// Every row of both tables, flattened. A promoting rule may be documented in
// either one: a type belongs in the bump table, a scope in the scope contract.
function allDocumentedRows(text) {
  return [...tableRows(text, 'Bump'), ...tableRows(text, 'Bumps version?')];
}

// The bump table's first cell names the prefixes; the second names the bump.
const BUMP_EXPECTATIONS = [
  { match: /fix|perf/i, bump: 'patch' },
  { match: /feat:/, bump: 'minor' },
  { match: /BREAKING|feat!/, bump: null },
  { match: /chore|docs|style/i, bump: 'no release' },
];

describe('T4 — the runbook states the real breaking-change bump (AC-007)', () => {
  it('test_when_runbook_breaking_row_read_then_it_states_minor_and_names_the_config', () => {
    const rows = tableRows(readRunbook(), 'Bump');
    const row = rows.find(([prefix]) => /BREAKING|feat!/.test(prefix));
    assert.ok(row, 'the bump table must carry a breaking-change row');

    assert.match(
      row[1],
      /minor/i,
      `the breaking row must state a minor bump; the config caps main at 0.x. Got: ${row[1]}`,
    );
    assert.match(
      readRunbook(),
      /\.releaserc\.json/,
      'the runbook must name .releaserc.json as the override home so a reader can see it was a choice',
    );
  });
});

describe('T4 — the runbook and the config cannot disagree (AC-008, AC-026)', () => {
  it('test_when_runbook_and_releaserc_compared_on_breaking_then_they_agree', () => {
    const rows = tableRows(readRunbook(), 'Bump');
    const row = rows.find(([prefix]) => /BREAKING|feat!/.test(prefix));
    assert.ok(row, 'the bump table must carry a breaking-change row');

    const configured = breakingRelease(readReleaserc());
    assert.ok(configured, '.releaserc.json must carry an explicit breaking rule');
    assert.match(
      row[1].toLowerCase(),
      new RegExp(configured),
      `runbook says "${row[1]}" and ${RELEASERC} says "${configured}" — ${RUNBOOK} and .releaserc.json disagree`,
    );
  });

  it('test_when_all_four_bump_rows_compared_then_each_agrees_with_the_config', () => {
    const rows = tableRows(readRunbook(), 'Bump');
    assert.equal(rows.length, BUMP_EXPECTATIONS.length, 'the bump table must carry exactly four rows');

    const configuredBreaking = breakingRelease(readReleaserc());
    const mismatches = [];
    for (const expectation of BUMP_EXPECTATIONS) {
      const row = rows.find(([prefix]) => expectation.match.test(prefix));
      if (!row) {
        mismatches.push(`no row matching ${expectation.match}`);
        continue;
      }
      const expected = expectation.bump ?? configuredBreaking;
      if (!new RegExp(expected, 'i').test(row[1])) {
        mismatches.push(`"${row[0]}" says "${row[1]}", expected "${expected}"`);
      }
    }

    assert.deepEqual(
      mismatches,
      [],
      `bump table rows disagree with .releaserc.json — ${RUNBOOK} vs ${RELEASERC}`,
    );
  });
});

describe('T5 — every demoted scope is documented, and vice versa (AC-009, AC-010)', () => {
  it('test_when_releaserc_read_then_site_src_is_demoted_alongside_site', () => {
    const scopes = demotedScopes(readReleaserc());
    assert.ok(
      scopes.includes('site-src'),
      `site-src must be demoted alongside site; a docs-site-only commit scoped site-src otherwise appears in the consumer changelog as a feature. Demoted: ${scopes.join(', ')}`,
    );
  });

  it('test_when_demoted_scopes_compared_both_ways_then_the_symmetric_difference_is_empty', () => {
    const configured = demotedScopes(readReleaserc());
    const text = readRunbook();
    const documented = tableRows(text, 'Bumps version?')
      .filter(([, bumps]) => /^no$/i.test(bumps))
      .flatMap(([scopeCell]) => [...scopeCell.matchAll(/`[a-z]+\(([a-z-]+)\)/g)].map((m) => m[1]))
      .filter((scope, index, all) => all.indexOf(scope) === index)
      .sort();

    const undocumented = configured.filter((scope) => !documented.includes(scope));
    const undemoted = documented.filter((scope) => !configured.includes(scope));

    assert.deepEqual(
      { undocumented, undemoted },
      { undocumented: [], undemoted: [] },
      `demoted-scope sets differ. Demoted but absent from ${RUNBOOK}: [${undocumented}]. Documented but not demoted in ${RELEASERC}: [${undemoted}]`,
    );
  });
});

// The parity test shipped reading only the demoting rules and the breaking rule.
// It went green while the runbook said `refactor:` publishes nothing (the config
// promotes it to patch) and never mentioned the `constitution` scope (which
// promotes any type to minor). Two more contradictions of the exact kind T4 exists
// to end, surviving inside the test that ends them. Backlog
// `releaserc-runbook-parity-covers-only-the-demoting-rules`.
describe('every promoting rule is documented, and vice versa', () => {
  it('test_when_a_rule_promotes_then_a_table_row_names_it_and_its_bump', () => {
    const text = readRunbook();
    const rows = allDocumentedRows(text);

    const undocumented = [];
    for (const rule of promotingRules(readReleaserc())) {
      const token = rule.scope ?? rule.type;
      const row = rows.find(([first]) => new RegExp(`\\b${token}\\b`).test(first));
      if (!row) {
        undocumented.push(`${token} promotes to ${rule.release} and no table row names it`);
        continue;
      }
      if (!new RegExp(rule.release, 'i').test(row.slice(1).join(' '))) {
        undocumented.push(`${token} promotes to ${rule.release}; its row says "${row[1]}"`);
      }
    }

    assert.deepEqual(
      undocumented,
      [],
      `a promoting rule the runbook does not state is a reader predicting no release and getting one — ${RUNBOOK} vs ${RELEASERC}`,
    );
  });

  it('test_when_a_table_row_claims_a_bump_the_preset_denies_then_the_config_grants_it', () => {
    const granted = new Set(promotingRules(readReleaserc()).map((rule) => rule.scope ?? rule.type));

    // Types the angular preset publishes nothing for. A runbook row promising one
    // of these a bump is only true while `releaseRules` says so.
    const presetSilent = ['refactor', 'build', 'ci', 'chore', 'docs', 'style', 'test'];
    const unbacked = [];
    for (const [first, ...rest] of allDocumentedRows(readRunbook())) {
      const bumpCell = rest.join(' ');
      if (!/\b(patch|minor|major)\b/i.test(bumpCell)) continue;
      for (const type of presetSilent) {
        if (new RegExp(`\`${type}[:(]`).test(first) && !granted.has(type)) {
          unbacked.push(`the runbook promises \`${type}\` a bump ("${bumpCell}") that ${RELEASERC} does not grant`);
        }
      }
    }

    assert.deepEqual(unbacked, [], `runbook rows must not promise a bump the config never makes`);
  });
});

describe('a non-product scope is demoted, so it cannot reach the consumer changelog', () => {
  it('test_when_releaserc_read_then_tests_is_demoted', () => {
    const scopes = demotedScopes(readReleaserc());
    assert.ok(
      scopes.includes('tests'),
      `\`tests\` names a surface the runbook's own ship list excludes, so a \`fix(tests):\` commit publishes a consumer-facing fix for files no consumer receives. Observed on c2149d5, which touched tests/unsanitised-path-sinks.test.mjs and nothing else. Demoted: ${scopes.join(', ')}`,
    );
  });
});

describe('T4 — the channels table agrees with the configured branches (AC-027)', () => {
  it('test_when_channels_table_compared_then_prerelease_branches_agree', () => {
    const rows = tableRows(readRunbook(), 'Dist-tag');
    assert.ok(rows.length > 0, 'the runbook must carry a channels table');

    const branches = (readReleaserc().branches || []).map(
      (entry) => (typeof entry === 'string' ? { name: entry, prerelease: false } : entry),
    );

    const mismatches = [];
    for (const [branchCell, distTagCell, shapeCell] of rows) {
      const name = (branchCell.match(/`([^`]+)`/) || [])[1];
      const declared = branches.find((entry) => entry.name === name);
      if (!declared) {
        mismatches.push(`${name} is documented but not declared in branches[]`);
        continue;
      }
      const documentedAsPrerelease = /-\w+\.N/.test(shapeCell) || !/`latest`/.test(distTagCell);
      if (Boolean(declared.prerelease) !== documentedAsPrerelease) {
        mismatches.push(`${name}: config prerelease=${Boolean(declared.prerelease)}, runbook implies ${documentedAsPrerelease}`);
      }
    }

    for (const declared of branches) {
      if (!rows.some(([cell]) => cell.includes(declared.name))) {
        mismatches.push(`${declared.name} is declared in branches[] but absent from the channels table`);
      }
    }

    assert.deepEqual(mismatches, [], `channels table disagrees with .releaserc.json branches[]`);
  });
});
