// power-track completion — structural contracts over shipped governance + SOP files.
//
// `project.json → test.kind` is "structural", so asserting on shipped SOP prose is this
// repo's established convention. These tests read live in-repo files, so their RED state
// is an assertion failure (not an import error) until /implement lands the prose.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const HERE = path.dirname(__filename);
const REPO_ROOT = path.resolve(HERE, '..');

const read = (rel) => readFileSync(path.join(REPO_ROOT, rel), 'utf8');

// Foundation: scope an assertion to one Article so prose elsewhere cannot false-positive.
function articleSection(claudeMd, numeral) {
  const pattern = new RegExp(`## Article ${numeral} —[\\s\\S]*?(?=\\n## Article [A-Z]|$)`);
  const match = claudeMd.match(pattern);
  assert.ok(match, `CLAUDE.md is missing '## Article ${numeral} —'`);
  return match[0];
}

// Foundation: the §18.4 predicate table body, bounded by its intro prose and the
// '**Node conditions.**' paragraph that follows it.
function predicateTableBody(seedMd) {
  const start = seedMd.indexOf('The closed set of declarative predicates');
  assert.notEqual(start, -1, 'seed.md is missing the §18.4 predicate-table intro');
  const end = seedMd.indexOf('**Node conditions.**', start);
  assert.notEqual(end, -1, 'seed.md is missing the **Node conditions.** paragraph after §18.4');
  return seedMd.slice(start, end);
}

describe('genesis — seed.md §18.4 registers the seventh predicate', () => {
  // AC-001
  it('test_when_seed_md_read_then_predicate_table_has_seven_rows_including_requires_config_flag', () => {
    const table = predicateTableBody(read('docs/init/seed.md'));
    const rows = table.split('\n').filter((line) => /^\|\s*`requires_/.test(line));

    assert.equal(rows.length, 7, `expected 7 predicate rows, got ${rows.length}`);
    assert.ok(
      rows.some((row) => row.includes('`requires_config_flag`')),
      'the §18.4 table must carry a requires_config_flag row'
    );
  });

  // AC-001
  it('test_when_seed_md_read_then_it_never_claims_eight_or_nine_predicates', () => {
    const seed = read('docs/init/seed.md');
    assert.doesNotMatch(seed, /eight predicates/i);
    assert.doesNotMatch(seed, /ninth predicate/i);
  });
});

describe('constitution — CLAUDE.md Article IV names the power track', () => {
  // AC-001
  it('test_when_claude_md_read_then_article_iv_names_the_power_track_and_its_flag_fence', () => {
    const articleIV = articleSection(read('CLAUDE.md'), 'IV');
    assert.match(articleIV, /\bpower\b/i, 'Article IV must name the power track');
    assert.match(articleIV, /velocity\.power_mode\.enabled/, 'Article IV must name the flag fence');
  });

  // AC-010
  it('test_when_claude_md_compared_to_its_mirror_then_byte_equal_and_under_size_cap', () => {
    const live = read('CLAUDE.md');
    const mirror = read('src/CLAUDE.template.md');

    assert.equal(live, mirror, 'CLAUDE.md and src/CLAUDE.template.md must be byte-equal');
    assert.ok(live.length <= 40000, `CLAUDE.md is ${live.length} chars; Article I.6 caps it at 40000`);
  });
});

describe('consumers can discover the feature flags', () => {
  // AC-006
  it('test_when_project_template_read_then_it_carries_both_flags_default_false', () => {
    const template = JSON.parse(read('src/project.template.json'));

    assert.equal(template.velocity?.power_mode?.enabled, false);
    assert.equal(template.velocity?.org_mode?.enabled, false);
  });
});

describe('security skill iterates tickets on the power track', () => {
  const skill = () => read('.claude/skills/security/SKILL.md');

  // AC-004
  it('test_when_security_skill_read_then_it_defines_per_ticket_iteration', () => {
    const text = skill();
    assert.match(text, /power/i, 'security must name the power track');
    assert.match(text, /tickets\[\]/, 'security must name workflow.json -> tickets[]');
    assert.match(text, /per[- ]ticket/i, 'security must state that review runs per ticket');
  });

  // AC-004
  it('test_when_security_skill_read_then_a_blocker_yields_the_batch_and_no_ticket_is_skipped', () => {
    const text = skill();
    assert.match(text, /BLOCKER/, 'security must state that a BLOCKER yields the batch');
    assert.match(text, /never silently skip|no ticket is silently skipped/i);
  });

  // AC-004
  it('test_when_security_skill_read_then_empty_tickets_yields_rather_than_passing', () => {
    const text = skill();
    assert.match(
      text,
      /empty[\s\S]{0,160}?tickets[\s\S]{0,160}?yield|tickets[\s\S]{0,80}?empty[\s\S]{0,160}?yield/i,
      'an empty or missing tickets[] on the power track must yield, not pass'
    );
  });
});

describe('commit skill splits the batch without a non-existent CLI', () => {
  const skill = () => read('.claude/skills/commit/SKILL.md');

  // AC-005
  it('test_when_commit_skill_read_then_it_parses_porcelain_and_calls_planCommits', () => {
    const text = skill();
    assert.match(text, /git status --porcelain/, 'commit must parse the dirty tree itself');
    assert.match(text, /planCommits/, 'commit must call planCommits(entries)');
  });

  // AC-005
  it('test_when_commit_skill_read_then_it_never_shells_out_to_the_inventory_module', () => {
    const text = skill();
    assert.ok(
      !text.includes('commit-planner/inventory.mjs'),
      'inventory.mjs exports groupDirtyTree only and has NO CLI entrypoint; commit must not invoke it'
    );
  });

  // AC-005
  it('test_when_commit_skill_read_then_the_closure_stamp_lands_on_the_final_commit', () => {
    const text = skill();
    assert.match(text, /final commit/i, 'the workflow.json + backlog closure stamp must land last');
  });
});

describe('triage skill gates power selection on the flag', () => {
  const skill = () => read('.claude/skills/triage/SKILL.md');

  // AC-002, AC-003
  it('test_when_triage_skill_read_then_it_documents_power_selection_gated_on_the_flag', () => {
    const text = skill();
    assert.match(text, /`power`/, 'triage must name the power track');
    assert.match(text, /velocity\.power_mode\.enabled/, 'triage must gate power on the flag');
  });

  // AC-002 — a clean generalized port is what the fence rests on
  it('test_when_triage_skill_read_then_it_carries_no_downstream_project_concepts', () => {
    const text = skill();
    assert.doesNotMatch(text, /ADR-0\d/, 'no external ADR citations belong in a baseline-owned skill');
    assert.ok(!text.includes('governance-review'), 'this baseline ships no governance-review skill');
  });
});
