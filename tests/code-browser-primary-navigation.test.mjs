// Artifact-assertion suite for code-browser-primary-navigation.
// Spec: docs/specs/code-browser-primary-navigation.md (research Candidate A —
// binding-layer doctrine relocation + deframe; no new hook).
//
// These assert the governance-artifact end state (navigation-routing Article in
// CLAUDE.md, deframed SKILL.md/seed/CONSTITUTION, preserved grep carve-outs,
// compression with binding preservation, byte-identical JS/TS helpers, the nav
// eval fixture). They do NOT test model navigation behavior — that is
// model-judgment (intake open question), demonstrated by the eval fixture, not
// gated here.

// AC traceability (spec docs/specs/code-browser-primary-navigation.md):
//   AC-001 -> navigation_article_present_with_fallback_boundary; seed_and_constitution_navigation_deframed
//   AC-002 -> universal_walk_primary_and_helper_optional; description_language_agnostic_and_names_explore
//   AC-003 -> shipped_template_checked_then_rule_and_skill_present
//   AC-004 -> walk_and_discover_hashed_then_unchanged (regression trap)
//   AC-005 -> audit PASS + counts 40 skills / 22 hooks: verified by the verify-tick full-suite + audit run, not a bespoke unit test (meta-AC)
//   AC-006 -> mirrors_compared_then_claudemd_byte_equal_and_seed_deframe_in_both
//   AC-007 -> claudemd_sized_then_within_cap_with_headroom; claudemd_checked_then_all_articles_and_citations_intact
//   AC-008 -> skill_read_then_grep_carveouts_preserved
//   AC-009 -> nav_eval_fixture_checked_then_expected_answers_resolve

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(REPO_ROOT, rel), 'utf8');
const sha256 = (rel) => createHash('sha256').update(readFileSync(join(REPO_ROOT, rel))).digest('hex');

// Pre-change baselines captured at scenario-tick (implement must NOT touch these).
const WALK_SHA = '35e4aaa57515192849a3cd32cff96bdd892854349789d72f4dd95917d932116e';
const DISCOVER_SHA = 'ac80d14d2d65a3712e295ac8f00822044242838e5d2671128be28f602f721602';

const CLAUDE_CHAR_CAP = 40000;
const CLAUDE_TARGET_MAX = 38500; // >= 1500 headroom (AC-007)

// Binding-rule markers that MUST survive the CLAUDE.md compression (AC-007).
const REQUIRED_ARTICLE_HEADINGS = [
  '## Article I', '## Article II', '## Article III', '## Article IV',
  '## Article V', '## Article VI', '## Article VII', '## Article VIII',
  '## Article IX', '## Article X', '## Article XI',
];
const REQUIRED_BINDING_MARKERS = ['No stubs', 'YAGNI', 'Context7', 'swarm-worker', 'approve-spec', 'grant-commit', '§17'];

function descriptionField(skillMd) {
  // frontmatter `description:` may span until the next top-level key or `---`.
  const m = skillMd.match(/^description:\s*([\s\S]*?)\n(?:[a-zA-Z_-]+:|---)/m);
  return m ? m[1] : '';
}

// The navigation entry in seed.md / CONSTITUTION.md — sliced around the
// `code-browser` mention so the deframe assertion is navigation-scoped (a bare
// whole-file "language-agnostic" match false-passes off seed §2.6).
function navEntry(text) {
  const idx = text.indexOf('code-browser');
  return idx === -1 ? '' : text.slice(Math.max(0, idx - 200), idx + 800);
}
// Deframe marker chosen to NOT collide with seed §2.6 "(language-agnostic)".
const DEFRAME_RE = /universal walk|any language|regardless of language|frontend (?:and|or|\/|, ?)?\s*backend/i;

describe('code-browser-primary-navigation — governance artifacts', () => {
  it('test_when_claudemd_read_then_navigation_article_present_with_fallback_boundary', () => {
    const c = read('CLAUDE.md');
    assert.match(c, /code-browser/i, 'CLAUDE.md must name code-browser in a routing rule');
    assert.match(c, /navigation/i, 'CLAUDE.md must address navigation routing');
    assert.match(c, /\b(first|primary)\b/i, 'must state code-browser is the first/primary attempt');
    assert.match(c, /Explore/, 'fallback boundary must name the Explore agent (not just grep)');
    assert.match(c, /dead-end|no\s+resolvable\s+structure|no\s+structure/i, 'must state the fallback boundary');
  });

  it('test_when_skill_read_then_universal_walk_primary_and_helper_optional', () => {
    const s = read('.claude/skills/code-browser/SKILL.md');
    assert.match(s, /language-agnostic|any language|regardless of framework/i, 'universal walk must be framed language-agnostic');
    assert.match(s, /optional/i, 'the JS/TS fast-path must be framed optional');
    assert.match(s, /accelerator/i, 'fast-path must be described as an accelerator');
  });

  it('test_when_skill_description_read_then_language_agnostic_and_names_explore', () => {
    const desc = descriptionField(read('.claude/skills/code-browser/SKILL.md'));
    assert.ok(desc.length > 0, 'description must be present');
    assert.match(desc, /Explore/, 'description must name the Explore agent it supersedes');
    assert.match(desc, /any language|language-agnostic|backend|regardless of/i, 'description must be language-agnostic, not frontend-only');
  });

  it('test_when_skill_read_then_grep_carveouts_preserved', () => {
    const s = read('.claude/skills/code-browser/SKILL.md');
    assert.match(s, /every file containing|full-text/i, 'pure full-text search carve-out must remain grep territory');
    assert.match(s, /type definitions|utility implementations/i, 'type/util lookup carve-out must remain');
  });

  it('test_when_walk_and_discover_hashed_then_unchanged', () => {
    assert.equal(sha256('.claude/skills/code-browser/walk.mjs'), WALK_SHA, 'walk.mjs must be byte-identical');
    assert.equal(sha256('.claude/skills/code-browser/discover.mjs'), DISCOVER_SHA, 'discover.mjs must be byte-identical');
  });

  it('test_when_claudemd_sized_then_within_cap_with_headroom', () => {
    const bytes = Buffer.byteLength(read('CLAUDE.md'), 'utf8');
    assert.ok(bytes <= CLAUDE_TARGET_MAX, `CLAUDE.md is ${bytes} bytes; must be <= ${CLAUDE_TARGET_MAX} (>= ${CLAUDE_CHAR_CAP - CLAUDE_TARGET_MAX} headroom)`);
  });

  it('test_when_claudemd_checked_then_all_articles_and_citations_intact', () => {
    const c = read('CLAUDE.md');
    for (const h of REQUIRED_ARTICLE_HEADINGS) {
      assert.ok(c.includes(h), `compression dropped a binding heading: ${h}`);
    }
    for (const m of REQUIRED_BINDING_MARKERS) {
      assert.ok(c.includes(m), `compression dropped a binding rule marker: ${m}`);
    }
  });

  it('test_when_mirrors_compared_then_claudemd_byte_equal_and_seed_deframe_in_both', () => {
    assert.equal(read('CLAUDE.md'), read('src/CLAUDE.template.md'), 'CLAUDE.md must be byte-equal to its mirror');
    // seed files are NOT byte-equal overall (§16 diverges by design); assert the
    // deframe landed in BOTH navigation entries instead (scoped — not a vacuous
    // whole-file match off seed §2.6).
    assert.match(navEntry(read('docs/init/seed.md')), DEFRAME_RE, 'seed.md navigation entry must carry the deframe');
    assert.match(navEntry(read('src/seed.template.md')), DEFRAME_RE, 'src/seed.template.md navigation entry must carry the same deframe');
  });

  it('test_when_seed_and_constitution_read_then_navigation_deframed', () => {
    assert.match(navEntry(read('docs/init/seed.md')), DEFRAME_RE, 'seed navigation entry deframed');
    assert.match(navEntry(read('.claude/CONSTITUTION.md')), DEFRAME_RE, 'CONSTITUTION Appendix B navigation entry deframed');
  });

  it('test_when_shipped_template_checked_then_rule_and_skill_present', () => {
    assert.match(read('obj/template/CLAUDE.md'), /code-browser/i, 'shipped CLAUDE.md must carry the navigation rule (reaches consumers)');
    assert.match(read('obj/template/.claude/skills/code-browser/SKILL.md'), /language-agnostic|any language|regardless of framework/i, 'shipped SKILL.md must be deframed');
  });

  it('test_when_nav_eval_fixture_checked_then_expected_answers_resolve', () => {
    const rel = 'tests/fixtures/code-browser-nav-eval.json';
    assert.ok(existsSync(join(REPO_ROOT, rel)), `${rel} must exist`);
    const corpus = JSON.parse(read(rel));
    assert.ok(Array.isArray(corpus) && corpus.length > 0, 'fixture must be a non-empty array');
    for (const entry of corpus) {
      assert.ok(typeof entry.question === 'string' && entry.question.length > 0, 'each entry needs a question');
      assert.ok(typeof entry.file === 'string' && existsSync(join(REPO_ROOT, entry.file)), `expected answer file must exist: ${entry.file}`);
      assert.ok(typeof entry.symbol === 'string' && entry.symbol.length > 0, 'each entry needs an expected symbol');
      assert.ok(read(entry.file).includes(entry.symbol), `expected symbol "${entry.symbol}" must appear in ${entry.file}`);
    }
  });
});
