// AC-002..AC-006 — verify becomes conditional in the chore track, gated on an explicit
// test.kind signal, with the constitutional amendment mirrored byte-faithfully.
//
// RED until: docs/init/seed.md (+ src/seed.template.md), CLAUDE.md (+ src/CLAUDE.template.md),
// and .claude/skills/chore/SKILL.md are amended, and project.json gains the test.kind key.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(REPO_ROOT, rel), 'utf8');

const chore = read('.claude/skills/chore/SKILL.md');
const seed = read('docs/init/seed.md');

const sliceBetween = (text, startMarker, endMarker) => {
  const start = text.indexOf(startMarker);
  const end = text.indexOf(endMarker, start + 1);
  assert.ok(start !== -1, `marker not found: ${startMarker}`);
  assert.ok(end !== -1 && end > start, `marker not found after ${startMarker}: ${endMarker}`);
  return text.slice(start, end);
};

describe('AC-002 — verify is a conditional chore phase gated on pure-docs + test.kind=behavior', () => {
  const mandatory = sliceBetween(chore, 'Mandatory phases', 'Conditional phases');
  const conditional = sliceBetween(chore, 'Conditional phases', '## Steps');

  it('test_when_chore_skill_then_verify_left_the_mandatory_block', () => {
    assert.doesNotMatch(
      mandatory,
      /\*\*`?verify`?\*\*/i,
      'verify must no longer be listed in the mandatory-always-run block',
    );
  });

  it('test_when_chore_skill_then_verify_is_in_conditional_block_with_trigger', () => {
    assert.match(conditional, /verify/i, 'verify must be listed among the conditional phases');
    assert.match(conditional, /test[._]kind/i, 'the verify trigger must reference test.kind');
    assert.match(conditional, /behavior/i, 'the verify trigger must reference the behavior suite kind');
    assert.match(conditional, /docs|prose/i, 'the verify trigger must reference a pure-docs/prose diff');
  });

  it('test_when_verify_skipped_then_summary_records_it', () => {
    assert.match(chore, /skip/i, 'the end-of-chore summary must record skipped conditional phases');
    assert.match(chore, /summary/i, 'the end-of-chore summary section must exist');
  });
});

describe('AC-003 — verify runs on code/config/script diffs regardless of test.kind', () => {
  it('test_when_diff_touches_code_then_verify_runs_regardless_of_test_kind', () => {
    assert.match(
      chore,
      /regardless of[^.\n]{0,40}test[._]kind/i,
      'chore SKILL must state verify runs regardless of test.kind when the diff is not pure-docs',
    );
  });
});

describe('AC-004 — verify runs for pure-docs when test.kind is absent/structural', () => {
  it('test_when_docs_only_and_structural_then_verify_runs', () => {
    assert.match(chore, /structural/i, 'chore SKILL must describe the structural case (verify still runs)');
  });
});

describe('AC-005 — absent/invalid test.kind resolves to structural (documented, both sides)', () => {
  const defaultRule = /(absent|invalid)[^.\n]{0,50}structural|structural[^.\n]{0,50}(default|absent)|default[^.\n]{0,30}structural/i;

  it('test_when_test_kind_absent_then_seed_documents_structural_default', () => {
    assert.match(seed, /test[._]kind/i, 'seed.md must document the test.kind key');
    assert.match(seed, defaultRule, 'seed.md must document absent/invalid test.kind -> structural');
  });

  it('test_when_test_kind_absent_then_chore_documents_structural_default', () => {
    assert.match(chore, defaultRule, 'chore SKILL must document absent/invalid test.kind -> structural');
  });
});

describe('AC-006 — amendment stays mirror-consistent and under the size cap', () => {
  it('test_when_amended_then_claude_md_byte_equal_to_template', () => {
    assert.equal(read('CLAUDE.md'), read('src/CLAUDE.template.md'), 'CLAUDE.md must stay byte-equal to src/CLAUDE.template.md');
  });

  it('test_when_amended_then_claude_md_under_40000_chars', () => {
    const len = read('CLAUDE.md').length;
    assert.ok(len <= 40000, `CLAUDE.md is ${len} chars; cap is 40000`);
  });

  it('test_when_amended_then_seed_amendment_present_in_both_seed_and_template', () => {
    for (const rel of ['docs/init/seed.md', 'src/seed.template.md']) {
      const t = read(rel);
      assert.match(t, /test[._]kind/i, `${rel} must carry the test.kind amendment`);
      assert.match(t, /behavior/i, `${rel} must carry the behavior trigger`);
    }
  });

  it('test_when_template_project_json_then_test_kind_absent_or_structural', () => {
    const tpl = JSON.parse(read('obj/template/.claude/project.json'));
    const kind = tpl.test && tpl.test.kind;
    assert.ok(
      kind === undefined || kind === 'structural',
      `obj/template project.json test.kind must be absent or "structural", got ${JSON.stringify(kind)}`,
    );
  });
});
