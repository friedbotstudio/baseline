// research-retrieve — Foundation layer (drives the prior-art retriever).
//
// Exercises .claude/skills/research/retrieve.mjs: a deterministic, stdlib-only
// retriever that scans docs/archive/**/{research,spec}.md + .claude/memory/
// {decisions,libraries}.md for term overlap, so /research retrieves prior art
// before deriving (Component 3, AC-006/007/009/010).
//
// RED until /implement creates retrieve.mjs (import fails until then).

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), '..');
const RETRIEVE_PATH = path.join(REPO_ROOT, '.claude/skills/research/retrieve.mjs');

let retrieve;
try {
  ({ retrieve } = await import(RETRIEVE_PATH));
} catch (err) {
  throw new Error(
    `Cannot import .claude/skills/research/retrieve.mjs (RED expected pre-/implement). Original: ${err.message}`
  );
}

function mkfixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'retr-'));
  const write = (rel, body) => {
    const abs = path.join(root, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, body);
  };
  return { root, write };
}

describe('retrieve() — prior-art retrieval', () => {
  it('ranks by term overlap; hits carry matchedTerms (AC-006, AC-010)', () => {
    const { root, write } = mkfixture();
    write('docs/archive/2020-01-01/foo/research.md', 'alpha beta gamma delta findings');
    write('.claude/memory/decisions.md', 'alpha only, no other overlap');

    const res = retrieve({ root, slug: 'x', terms: ['alpha', 'beta'] });
    assert.ok(Array.isArray(res.hits) && res.hits.length >= 2, 'expected >=2 hits');

    const top = res.hits[0];
    assert.ok(top.path.endsWith('research.md'), `top hit should be research.md, got ${top.path}`);
    assert.equal(typeof top.path, 'string');
    assert.equal(typeof top.score, 'number');
    assert.ok(Array.isArray(top.matchedTerms));
    assert.equal(typeof top.excerpt, 'string');
    assert.deepEqual([...top.matchedTerms].sort(), ['alpha', 'beta']);

    const decisionHit = res.hits.find((h) => h.path.endsWith('decisions.md'));
    assert.ok(decisionHit, 'decisions.md should be a hit (matches alpha)');
    assert.ok(top.score > decisionHit.score, 'research.md (2 terms) must outrank decisions.md (1 term)');
  });

  it('empty corpus → no hits, no throw (AC-009)', () => {
    const { root } = mkfixture();
    let res;
    assert.doesNotThrow(() => { res = retrieve({ root, slug: 'x', terms: ['alpha'] }); });
    assert.ok(Array.isArray(res.hits) && res.hits.length === 0);
  });

  it('missing corpus dirs tolerated (AC-009)', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'retr-bare-'));
    let res;
    assert.doesNotThrow(() => { res = retrieve({ root, slug: 'x', terms: ['alpha', 'beta'] }); });
    assert.deepEqual(res.hits, []);
  });

  it('empty terms → hits empty, deterministic (AC-009, AC-010)', () => {
    const { root, write } = mkfixture();
    write('docs/archive/2020-01-01/foo/research.md', 'alpha beta gamma');
    const res = retrieve({ root, slug: 'x', terms: [] });
    assert.deepEqual(res.hits, []);
  });

  it('determinism + stable sort by (score desc, path asc) (AC-010)', () => {
    const { root, write } = mkfixture();
    write('docs/archive/2020-01-01/aaa/research.md', 'alpha beta');
    write('docs/archive/2020-01-01/bbb/spec.md', 'alpha beta');
    write('.claude/memory/libraries.md', 'alpha');

    const a = retrieve({ root, slug: 'x', terms: ['alpha', 'beta'] });
    const b = retrieve({ root, slug: 'x', terms: ['alpha', 'beta'] });
    assert.deepStrictEqual(a, b);

    for (let i = 1; i < a.hits.length; i++) {
      const prev = a.hits[i - 1];
      const cur = a.hits[i];
      const ordered = prev.score > cur.score || (prev.score === cur.score && prev.path <= cur.path);
      assert.ok(ordered, `hits not sorted at ${i}: ${prev.path}(${prev.score}) before ${cur.path}(${cur.score})`);
    }
  });
});

// ─── Fixture: a temp root carrying a corpus, an archive, and the opt-in flag ───
//
// The structural lane reads `.claude/project.json` and `docs/system/elements/`
// relative to the caller's `root`, never process.cwd(). Every fixture below is a
// temp dir while cwd stays the repo, so a lane that resolved against cwd would
// silently read the REAL corpus and make each assertion here meaningless.

function mkCorpusFixture({ architectureMap = true } = {}) {
  const { root, write } = mkfixture();
  write(
    '.claude/project.json',
    JSON.stringify({ memory: { architecture_map: { enabled: architectureMap } } }, null, 2) + '\n'
  );
  const writeElement = (id, fields) => {
    const front = Object.entries(fields).map(([key, value]) => `${key}: ${value}`).join('\n');
    write(`docs/system/elements/${id}.md`, `---\nid: ${id}\n${front}\n---\n\n`);
  };
  return { root, write, writeElement };
}

function seedStructuralCorpus({ specBody = 'gamma delta findings' } = {}) {
  const { root, write, writeElement } = mkCorpusFixture();
  writeElement('a-thing', {
    kind: 'component',
    title: 'A thing',
    anchor: 'src/a.mjs',
    source_spec: 'oldwork',
  });
  write('docs/archive/2020-01-01/oldwork/spec.md', specBody);
  write('docs/archive/2020-01-02/other/research.md', 'alpha beta gamma');
  return { root, write, writeElement };
}

const STRUCTURAL_CALL = { terms: ['alpha', 'beta'], touchedPaths: ['src/a.mjs'], specDir: 'docs/system' };

function pathsOf(hits) {
  return hits.map((h) => h.path);
}

describe('retrieve() — structural lane over the corpus (AC-011)', () => {
  it('test_when_touched_path_resolves_to_element_with_source_spec_then_archived_spec_ranks_first_via_source_spec', () => {
    const { root } = seedStructuralCorpus();

    const res = retrieve({ root, slug: 'x', ...STRUCTURAL_CALL });

    const structuralHit = res.hits.find((h) => h.path === 'docs/archive/2020-01-01/oldwork/spec.md');
    assert.ok(structuralHit, `archived spec named by source_spec must be a hit; got ${pathsOf(res.hits).join(', ')}`);
    assert.equal(structuralHit.via, 'source_spec');

    const structuralIndex = res.hits.indexOf(structuralHit);
    const firstTermIndex = res.hits.findIndex((h) => h.via === 'terms');
    assert.ok(firstTermIndex !== -1, 'the term lane must still produce hits');
    assert.ok(
      structuralIndex < firstTermIndex,
      `structural hit at ${structuralIndex} must rank above the first term hit at ${firstTermIndex}`
    );
  });

  it('test_when_structural_lane_runs_then_term_lane_still_returns_its_own_hits_tagged_terms', () => {
    const { root } = seedStructuralCorpus();

    const withStructural = retrieve({ root, slug: 'x', ...STRUCTURAL_CALL });
    const termsOnly = retrieve({ root, slug: 'x', terms: STRUCTURAL_CALL.terms });

    const termHits = withStructural.hits.filter((h) => h.via === 'terms');
    assert.ok(termHits.length > 0, 'D5: the structural lane ranks above term overlap, it does not replace it');
    assert.deepEqual(
      pathsOf(termHits).sort(),
      pathsOf(termsOnly.hits).sort(),
      'the term lane must return the same sources it returns on its own'
    );
    for (const hit of termHits) {
      const baseline = termsOnly.hits.find((h) => h.path === hit.path);
      assert.equal(hit.score, baseline.score, `term score changed for ${hit.path}`);
    }
  });

  it('test_when_a_path_is_hit_by_both_lanes_then_one_hit_survives_tagged_source_spec', () => {
    const { root } = seedStructuralCorpus({ specBody: 'alpha beta gamma delta' });

    const res = retrieve({ root, slug: 'x', ...STRUCTURAL_CALL });

    const claimed = res.hits.filter((h) => h.path === 'docs/archive/2020-01-01/oldwork/spec.md');
    assert.equal(claimed.length, 1, 'a path claimed by both lanes must survive exactly once');
    assert.equal(claimed[0].via, 'source_spec', 'the stronger label wins');
    assert.deepEqual([...claimed[0].matchedTerms].sort(), ['alpha', 'beta'], 'the term lane evidence is kept, not discarded');
    assert.equal(claimed[0].score, 2);
  });

  it('test_when_no_touched_paths_or_spec_dir_then_hits_match_the_legacy_result', () => {
    const { root, write } = mkfixture();
    write('docs/archive/2020-01-01/foo/research.md', 'alpha beta gamma delta findings');
    write('.claude/memory/decisions.md', 'alpha only, no other overlap');

    const res = retrieve({ root, slug: 'x', terms: ['alpha', 'beta'] });

    assert.deepEqual(pathsOf(res.hits), [
      'docs/archive/2020-01-01/foo/research.md',
      '.claude/memory/decisions.md',
    ]);
    for (const hit of res.hits) assert.equal(hit.via, 'terms');
    assert.deepEqual(res.structural, []);
    assert.deepEqual(res.structuralUnresolved, []);
  });

  it('test_when_architecture_map_flag_is_off_then_the_structural_lane_is_inert', () => {
    const { root, write, writeElement } = mkCorpusFixture({ architectureMap: false });
    writeElement('a-thing', { kind: 'component', title: 'A thing', anchor: 'src/a.mjs', source_spec: 'oldwork' });
    write('docs/archive/2020-01-01/oldwork/spec.md', 'gamma delta findings');
    write('docs/archive/2020-01-02/other/research.md', 'alpha beta gamma');

    let gated;
    assert.doesNotThrow(() => { gated = retrieve({ root, slug: 'x', ...STRUCTURAL_CALL }); });
    const ungated = retrieve({ root, slug: 'x', terms: STRUCTURAL_CALL.terms });

    assert.deepStrictEqual(gated, ungated, 'flag off must be indistinguishable from never passing the new params');
  });

  it('test_when_source_spec_value_is_hostile_then_it_is_rejected_before_any_path_is_constructed', () => {
    const { root, write, writeElement } = mkCorpusFixture();
    const hostile = ['../../etc', 'a/b', 'A_B', '', 'z'.repeat(5000)];
    hostile.forEach((value, i) => {
      writeElement(`hostile-${i}`, {
        kind: 'component',
        title: `Hostile ${i}`,
        anchor: `src/h${i}.mjs`,
        source_spec: value,
      });
    });
    write('docs/archive/2020-01-01/real/spec.md', 'gamma');
    write('docs/etc/spec.md', 'this file is the traversal target and must never be read');

    let res;
    assert.doesNotThrow(() => {
      res = retrieve({
        root,
        slug: 'x',
        terms: ['gamma'],
        touchedPaths: hostile.map((_, i) => `src/h${i}.mjs`),
        specDir: 'docs/system',
      });
    });

    assert.ok(
      !pathsOf(res.hits).some((p) => p.includes('docs/etc/')),
      'a ../.. source_spec must not resolve outside docs/archive'
    );
    assert.deepEqual(res.structural, [], 'no hostile slug may resolve to a structural hit');
    assert.equal(
      res.structuralUnresolved.length,
      hostile.length,
      'every rejected slug is reported, so the shortfall is falsifiable rather than silent'
    );
    for (const row of res.structuralUnresolved) {
      assert.ok(hostile.includes(row.source_spec), `unexpected reported slug: ${row.source_spec}`);
    }
  });

  it('test_when_source_spec_names_a_slug_with_no_archived_spec_then_it_is_reported_unresolved_not_hit', () => {
    const { root, write, writeElement } = mkCorpusFixture();
    writeElement('missing-one', {
      kind: 'component', title: 'Missing', anchor: 'src/m.mjs', source_spec: 'neverarchived',
    });
    writeElement('approved-only', {
      kind: 'component', title: 'Approved only', anchor: 'src/n.mjs', source_spec: 'approvedonly',
    });
    write('docs/archive/2020-01-03/approvedonly/spec.approved', 'APPROVED\n1778675952\n/x/spec.md\nN/A\n');
    write('docs/archive/2020-01-02/other/research.md', 'alpha beta');

    const res = retrieve({
      root, slug: 'x', terms: ['alpha'], touchedPaths: ['src/m.mjs', 'src/n.mjs'], specDir: 'docs/system',
    });

    assert.deepEqual(res.structural, []);
    assert.deepEqual(
      res.structuralUnresolved.map((r) => r.source_spec).sort(),
      ['approvedonly', 'neverarchived'],
      'spec.approved is an approval token, not a spec — it is not a resolution fallback'
    );
    for (const row of res.structuralUnresolved) assert.equal(typeof row.element, 'string');
  });

  it('test_when_called_twice_with_both_lanes_then_the_results_are_deep_equal', () => {
    const { root } = seedStructuralCorpus({ specBody: 'alpha gamma' });

    const a = retrieve({ root, slug: 'x', ...STRUCTURAL_CALL });
    const b = retrieve({ root, slug: 'x', ...STRUCTURAL_CALL });
    assert.deepStrictEqual(a, b);

    for (let i = 1; i < a.hits.length; i++) {
      const prev = a.hits[i - 1];
      const cur = a.hits[i];
      const structuralFirst = (prev.via === 'source_spec') >= (cur.via === 'source_spec');
      assert.ok(structuralFirst, `structural hit must not sort below a term hit at ${i}`);
      if (prev.via === cur.via) {
        const ordered = prev.score > cur.score || (prev.score === cur.score && prev.path <= cur.path);
        assert.ok(ordered, `within a lane, order is score desc then path asc; broke at ${i}`);
      }
    }
  });
});

// A lone surrogate is a UTF-16 code unit with no partner. It is what a naive
// .slice() on an astral character leaves behind, and it is invalid UTF-8 the
// moment a consumer writes the excerpt back out.
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;

describe('retrieve() — excerpt truncation', () => {
  it('test_when_excerpt_truncation_lands_inside_a_surrogate_pair_then_no_lone_surrogate_is_emitted', () => {
    const { root, write } = mkfixture();
    write('docs/archive/2020-01-01/foo/research.md', `delta ${'x'.repeat(153)}\u{1F600} tail\n`);

    const res = retrieve({ root, slug: 'x', terms: ['delta'] });

    assert.equal(res.hits.length, 1);
    assert.ok(
      !LONE_SURROGATE.test(res.hits[0].excerpt),
      `excerpt ends in an unpaired surrogate: ${JSON.stringify(res.hits[0].excerpt.slice(-4))}`
    );
  });
});

describe('retrieve CLI', () => {
  it('exits 0 and prints JSON with a hits array (AC-006)', () => {
    const { root, write } = mkfixture();
    write('docs/archive/2020-01-01/foo/research.md', 'alpha beta gamma');
    let stdout;
    try {
      stdout = execFileSync('node', [
        RETRIEVE_PATH, '--slug', 'x', '--terms', 'alpha beta', '--root', root,
      ], { encoding: 'utf8' });
    } catch (err) {
      assert.fail(`CLI exited non-zero: ${err.status}\nstderr: ${err.stderr}`);
    }
    const parsed = JSON.parse(stdout);
    assert.ok(Array.isArray(parsed.hits), 'stdout JSON must carry a hits array');
  });

  it('test_when_cli_runs_then_stdout_json_carries_its_own_summary_counts', () => {
    const { root, write } = mkfixture();
    write('docs/archive/2020-01-01/foo/research.md', 'alpha beta gamma');

    const stdout = execFileSync('node', [
      RETRIEVE_PATH, '--slug', 'x', '--terms', 'alpha beta', '--root', root,
    ], { encoding: 'utf8' });

    const parsed = JSON.parse(stdout);
    assert.equal(typeof parsed.summary, 'object', 'the counts must live in stdout, not only in the stderr line');
    assert.equal(parsed.summary.corpusScanned, parsed.corpusScanned.length);
    assert.equal(parsed.summary.hits, parsed.hits.length);
    assert.equal(typeof parsed.summary.structural, 'number');
  });

  it('test_when_cli_is_given_one_quoted_json_array_of_touched_paths_then_the_structural_lane_runs', () => {
    const { root } = seedStructuralCorpus();

    const stdout = execFileSync('node', [
      RETRIEVE_PATH,
      '--slug', 'x',
      '--terms', 'alpha beta',
      '--root', root,
      '--touched', JSON.stringify(['src/a.mjs']),
      '--spec-dir', 'docs/system',
    ], { encoding: 'utf8' });

    const parsed = JSON.parse(stdout);
    const structuralHit = parsed.hits.find((h) => h.via === 'source_spec');
    assert.ok(structuralHit, 'the CLI must thread --touched into the structural lane');
    assert.equal(structuralHit.path, 'docs/archive/2020-01-01/oldwork/spec.md');
  });

  it('test_when_touched_json_is_malformed_then_the_cli_exits_zero_with_an_empty_structural_lane', () => {
    const { root } = seedStructuralCorpus();

    for (const malformed of ['not json', '{}']) {
      const stdout = execFileSync('node', [
        RETRIEVE_PATH,
        '--slug', 'x',
        '--terms', 'alpha beta',
        '--root', root,
        '--touched', malformed,
        '--spec-dir', 'docs/system',
      ], { encoding: 'utf8' });

      const parsed = JSON.parse(stdout);
      assert.deepEqual(parsed.structural, [], `--touched ${malformed} must not produce structural hits`);
      assert.ok(parsed.hits.some((h) => h.via === 'terms'), 'the term lane stays intact on malformed input');
    }
  });
});
