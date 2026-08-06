// central-system-spec slice A1 — the genesis amendment (AC-001, AC-002, AC-003, AC-004).
//
// Article I.4 orders the amendment seed.md > CLAUDE.md > implementation, so
// these four tests gate every later wave: until the genesis names the central
// system spec and both mirrors verify, no implementation slice may land.
//
// These read DEV-REPO files rather than tmp fixtures — they are RED until the
// on-disk governance documents actually carry the amendment, which makes them
// integration verification for the live tree, not unit tests of a copy.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseFrontmatter } from '../.claude/hooks/lib/frontmatter-parser.mjs';
import { run as constitutionCheck } from '../.claude/skills/audit-baseline/checks/constitution.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(resolve(REPO_ROOT, rel), 'utf8');

// The seed mirror is NOT full-byte: §16 is project-specific by construction, so
// the template ships a reserved placeholder while the live file carries this
// repo's /init-project output. tests/seed-template-parity.test.mjs owns that
// contract; here we only need its two slicing markers.
const SEC16 = '\n## §16 — Project-specific configuration';
const SEC17 = '\n## §17';

function sliceBefore(text, marker) {
  const i = text.indexOf(marker);
  assert.notEqual(i, -1, `expected to find ${JSON.stringify(marker)} in the document`);
  return text.slice(0, i);
}

function sliceFrom(text, marker) {
  const i = text.indexOf(marker);
  assert.notEqual(i, -1, `expected to find ${JSON.stringify(marker)} in the document`);
  return text.slice(i);
}

// Scoped-section assertion: capture one `## §N` section and assert against that
// slice, never the whole document — prose elsewhere would false-positive.
function sectionOf(text, heading) {
  const start = text.indexOf(heading);
  assert.notEqual(start, -1, `expected section ${JSON.stringify(heading)} in the document`);
  const rest = text.slice(start + heading.length);
  const end = rest.search(/\n## §/);
  return end === -1 ? rest : rest.slice(0, end);
}

function decisionEntries() {
  const dir = resolve(REPO_ROOT, '.claude/memory/decisions');
  return readdirSync(dir)
    .filter((name) => name.endsWith('.md'))
    .map((name) => {
      const text = readFileSync(join(dir, name), 'utf8');
      // parseFrontmatter returns { frontmatter, body } — the fields are one level in.
      return { name, text, front: parseFrontmatter(text).frontmatter };
    });
}

// Exercises the REAL audit check with an injected readText, so the boundary is
// asserted against shipped enforcement rather than a reimplementation of it.
function sizeCapRowsFor(claudeText) {
  const rows = constitutionCheck({
    readText: (rel) => (rel === 'CLAUDE.md' ? claudeText : ''),
    EXEMPT_RELPATHS: [],
    hasDerivedHeader: () => false,
  });
  return rows.filter(([name]) => name === 'size cap: CLAUDE.md');
}

describe('A1 — the genesis amendment names the central system spec', () => {
  it('test_when_seed_amended_then_central_spec_component_entry_present', () => {
    const seed = read('docs/init/seed.md');

    const components = sectionOf(seed, '\n## §4 — Components');
    assert.match(components, /docs\/system\//,
      'seed.md §4 must name the docs/system/ directory shape');
    assert.match(components, /\.claude\/skills\/workspace\//,
      'seed.md §4 must name the workspace helper directory');
    assert.match(components, /memory\.architecture_map/,
      'seed.md §4 must name the memory.architecture_map flags gating the layer');

    for (const [heading, label] of [
      ['\n## §9', '§9 diagram-driven specs'],
      ['\n## §3', '§3 directory structure'],
      ['\n## §12', '§12 archive discipline'],
    ]) {
      assert.match(sectionOf(seed, heading), /docs\/system\//,
        `seed.md ${label} must reference the central system spec at docs/system/`);
    }
  });

  it('test_when_mirror_diverges_then_audit_baseline_fails', () => {
    const liveSeed = read('docs/init/seed.md');
    const tplSeed = read('src/seed.template.md');

    assert.equal(sliceBefore(tplSeed, SEC16), sliceBefore(liveSeed, SEC16),
      'src/seed.template.md must mirror docs/init/seed.md byte-for-byte before §16');
    assert.equal(sliceFrom(tplSeed, SEC17), sliceFrom(liveSeed, SEC17),
      'src/seed.template.md must mirror docs/init/seed.md byte-for-byte from §17 onward');

    // The amendment lands in §4/§9/§3/§12 — all inside the mirrored region, so
    // it must appear in BOTH files, not just the live one.
    assert.match(sliceBefore(tplSeed, SEC16), /docs\/system\//,
      'the template must carry the amendment too — §4 is inside the mirrored pre-§16 body');

    const liveClaude = read('CLAUDE.md');
    const tplClaude = read('src/CLAUDE.template.md');
    assert.equal(tplClaude, liveClaude,
      'src/CLAUDE.template.md is a byte-equal mirror of CLAUDE.md (no carve-out)');
    assert.match(liveClaude, /docs\/system\//,
      'CLAUDE.md Article IX must repoint the corpus to docs/system/');

    // Prove the comparison is load-bearing: a single injected byte must break it.
    assert.notEqual(`${liveClaude}x`, tplClaude,
      'byte-equality must detect a one-character divergence');
  });

  it('test_when_claude_md_at_and_over_cap_then_pass_then_fail', () => {
    const atCap = sizeCapRowsFor('x'.repeat(40000));
    assert.deepEqual(atCap.map(([, status]) => status), ['PASS'],
      'exactly 40000 characters is within the Article I.6 cap');

    const overCap = sizeCapRowsFor('x'.repeat(40001));
    assert.deepEqual(overCap.map(([, status]) => status), ['FAIL'],
      '40001 characters must fail the Article I.6 cap');
    assert.match(overCap[0][2], /CONSTITUTION\.md/,
      'the failure must point the maintainer at the annex');

    const claudeChars = read('CLAUDE.md').length;
    assert.ok(claudeChars <= 40000,
      `CLAUDE.md is ${claudeChars} chars after the amendment; cap is 40000 — ` +
      'move narration to .claude/CONSTITUTION.md');
  });

  it('test_when_supersession_entries_written_then_each_names_superseded_decision', () => {
    const entries = decisionEntries();

    const supersessions = [
      { decision: 'D2', replacement: /witness/i },
      { decision: 'D3', replacement: /view/i },
      { decision: 'D8', replacement: /cite|citab/i },
    ];

    // Decision numbering is PER-SPEC, so a bare `D3` is ambiguous: the
    // workspace-corpus-backfill spec has its own D3, and an entry citing it also
    // mentions the architecture map elsewhere in its body. Requiring the token and
    // `architecture-map` on the SAME LINE binds the number to the spec that owns it.
    for (const { decision, replacement } of supersessions) {
      const owned = new RegExp(`\\b${decision}\\b[^\\n]{0,60}architecture-map`);
      const matches = entries.filter((e) => owned.test(e.text));
      assert.equal(matches.length, 1,
        `expected exactly one decision entry superseding architecture-map ${decision}, ` +
        `found ${matches.length}`);

      const entry = matches[0];
      assert.match(entry.text, replacement,
        `${entry.name} must state the replacement rule for ${decision}`);
      assert.ok(entry.front.governs,
        `${entry.name} must carry governs: naming the paths the superseded decision affected`);
      assert.equal(entry.front.category, 'decisions',
        `${entry.name} must be filed in the decisions category`);
    }
  });
});
