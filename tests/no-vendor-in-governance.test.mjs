// release-safety-2026-08-25 T7 — AC-017, AC-022.
//
// The point of the pointer is that the constitution stops caring which provider is
// configured. That only holds if no shipped governance file or skill names one, so
// this is the test that keeps the vendor out after the swap.
//
// `src/cli/renames.js` is the sole exception, and deliberately so: recording the
// rename is what lets an upgrade shed the retired entry instead of carrying both
// forever. The same carve-out already exists for the sprint-channel -> baseline
// rename, documented in docs/specs/baseline-mcp.md AC-008.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

import { REPO_ROOT } from './helpers/memory-fixtures.mjs';

const RETIRED_VENDOR = /context7/i;

// Only the file whose job is remembering the rename may name what was retired.
const EXEMPT = new Set(['src/cli/renames.js']);

const GOVERNANCE_FILES = [
  'CLAUDE.md',
  'src/CLAUDE.template.md',
  'docs/init/seed.md',
  'src/seed.template.md',
  '.claude/CONSTITUTION.md',
  'README.md',
  'PRODUCT.md',
  '.mcp.json',
];

function shippedSkillDocs() {
  const skillsDir = join(REPO_ROOT, '.claude', 'skills');
  return readdirSync(skillsDir)
    .map((name) => join('.claude', 'skills', name, 'SKILL.md'))
    .filter((rel) => existsSync(join(REPO_ROOT, rel)));
}

function offendingLines(rel) {
  const text = readFileSync(join(REPO_ROOT, rel), 'utf8');
  return text
    .split('\n')
    .map((line, index) => ({ line: index + 1, text: line }))
    .filter(({ text: line }) => RETIRED_VENDOR.test(line))
    .map(({ line, text: body }) => `${rel}:${line}: ${body.trim().slice(0, 100)}`);
}

describe('T7 — the retired vendor is named nowhere in governance (AC-017)', () => {
  for (const rel of GOVERNANCE_FILES) {
    it(`test_when_${rel.replace(/[^\w]/g, '_')}_is_scanned_then_it_names_no_provider_vendor`, () => {
      assert.deepEqual(
        offendingLines(rel),
        [],
        `${rel} still names the retired provider — the constitution must not care which provider is configured`,
      );
    });
  }

  it('test_when_every_shipped_skill_doc_is_scanned_then_none_names_a_provider_vendor', () => {
    const offenders = shippedSkillDocs().flatMap(offendingLines);
    assert.deepEqual(
      offenders,
      [],
      'a skill naming a vendor makes the next swap an edit to that skill; it must consult the pointer instead',
    );
  });

  it('test_when_the_rename_record_is_scanned_then_it_is_the_only_file_that_may_name_the_retired_server', () => {
    const rel = 'src/cli/renames.js';
    assert.ok(EXEMPT.has(rel), 'the exemption list must carry the rename record');
    assert.notDeepEqual(
      offendingLines(rel),
      [],
      'the rename record must name what was retired, or an upgrade cannot shed the old entry',
    );
  });
});

describe('T7 — the provider-replacement procedure has a home (AC-022)', () => {
  const PROCEDURE_SURFACES = [
    '.claude/commands/init-project.md',
    '.claude/skills/upgrade-project/SKILL.md',
  ];

  for (const rel of PROCEDURE_SURFACES) {
    it(`test_when_${rel.replace(/[^\w]/g, '_')}_is_read_then_it_names_the_two_step_provider_change`, () => {
      const text = readFileSync(join(REPO_ROOT, rel), 'utf8');
      assert.match(
        text,
        /docs-provider\.json/,
        `${rel} must name the pointer file — the procedure lives with the commands a consumer runs, not in the constitution`,
      );
      assert.match(
        text,
        /\.mcp\.json/,
        `${rel} must name .mcp.json — changing a provider is an entry edit plus a pointer edit`,
      );
    });
  }
});
