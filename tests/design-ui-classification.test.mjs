import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = dirname(fileURLToPath(new URL('../package.json', import.meta.url)));

const SKILL_MD     = join(ROOT, '.claude/skills/design-ui/SKILL.md');
const REF_DIR      = join(ROOT, '.claude/skills/design-ui/references');
const INTENT_TABLE = join(REF_DIR, 'intent-table.md');
const DESIGN_VS_DEV = join(REF_DIR, 'design-vs-development.md');

// Canonical impeccable subcommand vocabulary (matches the skill's own command table).
const IMPECCABLE_CMDS_RE = /\b(shape|craft|teach|document|extract|critique|audit|polish|bolder|quieter|distill|harden|onboard|animate|colorize|typeset|layout|delight|overdrive|clarify|adapt|optimize|live)\b/i;

function countOccurrences(haystack, needle) {
  return (haystack.match(new RegExp(needle, 'gi')) || []).length;
}

function tableRows(markdown) {
  // A markdown table row starts with `|`. Skip separator rows like `|---|---|`.
  return markdown
    .split('\n')
    .filter(line => /^\s*\|/.test(line) && !/^\s*\|[\s:-]+\|/.test(line));
}

describe('design-ui — Stage 0 classification (AC-001/002/003)', () => {
  it('test_when_design_ui_skill_md_exists_then_describes_stage_0_classification', async () => {
    const text = await readFile(SKILL_MD, 'utf8');
    const fmMatch = text.match(/^---\n([\s\S]*?)\n---/);
    assert.ok(fmMatch, 'SKILL.md must have YAML frontmatter');
    assert.match(
      fmMatch[1],
      /orchestrat/i,
      'frontmatter description must mention orchestrator/orchestrates'
    );
    assert.match(text, /Stage\s*0/i, 'body must describe Stage 0 (classification)');
    assert.match(text, /not_a_design_task/, 'body must mention not_a_design_task terminal state');
    // AC-001, AC-008 — multi-lane misroute returns mixed_brief with a lane_split field.
    assert.match(text, /mixed_brief/, 'body must mention mixed_brief terminal state');
    assert.match(text, /lane_split/, 'body must document the lane_split field');
  });

  it('test_when_design_vs_development_md_exists_then_has_classification_rules', async () => {
    const text = await readFile(DESIGN_VS_DEV, 'utf8');
    assert.ok(countOccurrences(text, 'design')      >= 3, 'should mention "design" at least 3 times');
    assert.ok(countOccurrences(text, 'development') >= 3, 'should mention "development" at least 3 times');
    assert.ok(countOccurrences(text, 'copy')        >= 3, 'should mention "copy" at least 3 times');
    assert.match(
      text,
      /typography|spacing|motion|layout|register/i,
      'should include at least one design-lane example'
    );
    assert.match(
      text,
      /validation|handler|endpoint|business rule|state management/i,
      'should include at least one development-lane example'
    );
    assert.match(
      text,
      /label|message|prose|microcopy/i,
      'should include at least one copy-lane example'
    );
  });

  // AC-009 — design-vs-development.md is the mirror; SKILL.md is the canonical source for misroute prose.
  it('test_when_design_vs_development_md_then_designates_skill_md_as_canonical', async () => {
    const text = await readFile(DESIGN_VS_DEV, 'utf8');
    const canonicalThenSkill = /canonical[^.\n]{0,80}SKILL\.md/i.test(text);
    const skillThenCanonical = /SKILL\.md[^.\n]{0,80}canonical/i.test(text);
    assert.ok(
      canonicalThenSkill || skillThenCanonical,
      'design-vs-development.md must identify SKILL.md as the canonical source for misroute prose ' +
      '(this file is the mirror)'
    );
  });

  it('test_when_intent_table_md_exists_then_has_at_least_15_rows_with_recipe_mappings', async () => {
    const text = await readFile(INTENT_TABLE, 'utf8');
    const rows = tableRows(text);
    // First row is the header; data rows = total - 1.
    const dataRows = Math.max(0, rows.length - 1);
    assert.ok(dataRows >= 15, `expected >= 15 data rows in intent table; found ${dataRows}`);
    const withoutCmd = rows.slice(1).filter(r => !IMPECCABLE_CMDS_RE.test(r));
    // Allow up to 2 rows that don't name a command (e.g., the empty/ambiguous catch-all).
    assert.ok(
      withoutCmd.length <= 2,
      `most data rows must name at least one impeccable subcommand; ${withoutCmd.length} did not`
    );
  });

  it('test_when_intent_table_row_for_build_a_then_recipe_includes_shape_craft_and_ask_marker', async () => {
    const text = await readFile(INTENT_TABLE, 'utf8');
    const rows = tableRows(text);
    const buildRow = rows.find(r => /\b(build|create|add\s+a)\b/i.test(r));
    assert.ok(buildRow, 'intent table must include a row for build/create/add-a intents');
    assert.match(buildRow, /\bshape\b/i,  'build/create row must include shape in the recipe');
    assert.match(buildRow, /\bcraft\b/i,  'build/create row must include craft in the recipe');
    assert.match(
      buildRow,
      /\bask\b|multi-step|approval/i,
      'build/create row must indicate ask/multi-step/approval mode'
    );
  });

  it('test_when_intent_table_row_for_polish_then_recipe_marks_auto', async () => {
    const text = await readFile(INTENT_TABLE, 'utf8');
    const rows = tableRows(text);
    const polishRow = rows.find(r => /\bpolish/i.test(r));
    assert.ok(polishRow, 'intent table must include a row for polish intents');
    assert.match(polishRow, /\baudit\b/i,  'polish row must include audit in the recipe');
    assert.match(polishRow, /\bpolish\b/i, 'polish row must include polish in the recipe');
    assert.match(
      polishRow,
      /\bauto\b|atom|single-step/i,
      'polish row must indicate auto/atom/single-step mode'
    );
  });

  it('test_when_design_ui_skill_md_then_documents_task_brief_schema', async () => {
    const text = await readFile(SKILL_MD, 'utf8');
    const required = ['concern', 'intent', 'slug', 'target_files', 'write_set', 'register_override', 'references'];
    const missing  = required.filter(f => !new RegExp(`\\b${f}\\b`).test(text));
    assert.equal(
      missing.length,
      0,
      `SKILL.md must document all task_brief fields; missing: ${missing.join(', ')}`
    );
  });

  // AC-002, AC-008 — lane_split entries have shape { surface, lane, reason }; lane ∈ {design, development, copy}.
  it('test_when_design_ui_skill_md_then_documents_lane_split_shape', async () => {
    const text = await readFile(SKILL_MD, 'utf8');
    const subfields = ['surface', 'lane', 'reason'];
    const missingSubfields = subfields.filter(f => !new RegExp(`\\b${f}\\b`).test(text));
    assert.equal(
      missingSubfields.length,
      0,
      `SKILL.md must name the three lane_split sub-fields; missing: ${missingSubfields.join(', ')}`
    );
    const lanes = ['design', 'development', 'copy'];
    const missingLanes = lanes.filter(l => !new RegExp(`["'\`]${l}["'\`]`).test(text));
    assert.equal(
      missingLanes.length,
      0,
      `SKILL.md must list the three lane values (quoted) in the lane vocabulary; missing: ${missingLanes.join(', ')}`
    );
  });
});
