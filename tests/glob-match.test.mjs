// Scenarios for the hoisted glob compiler (docs/specs/globtoregex-shared-module-hoist.md,
// amended 2026-08-15). Covers AC-001..AC-008.
//
// RED until .claude/hooks/lib/glob-match.mjs lands and every consumer imports it.
//
// Two numbers in here are measured, not guessed, and the comments say which:
// a single 60-star run costs 130,804 ms uncollapsed and 0.0 ms collapsed; six
// runs separated by literals still cost 45,952 ms AFTER the collapse, which is
// why the bounds exist at all.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = join(dirname(__filename), '..');

const MODULE_REL = '.claude/hooks/lib/glob-match.mjs';

// The module under test does not exist until /implement runs. Importing it
// eagerly would make the whole file uncollectable and report a misleading
// "cannot find module" for scenarios that never touch it, so every test
// resolves it through here and fails on its own assertion instead.
async function importGlobMatch() {
  const abs = join(REPO_ROOT, MODULE_REL);
  assert.ok(existsSync(abs), `${MODULE_REL} does not exist yet — this is the RED state /implement resolves`);
  return import(`${pathToFileURL(abs).href}?t=${process.hrtime.bigint()}`);
}

const readJson = (rel) => JSON.parse(readFileSync(join(REPO_ROOT, rel), 'utf8'));

function elapsedMs(fn) {
  const t0 = process.hrtime.bigint();
  fn();
  return Number(process.hrtime.bigint() - t0) / 1e6;
}

// The write set the spec declares, minus the tests themselves. AC-006 scans these.
const CONSUMER_MODULES = [
  '.claude/hooks/lib/glob-match.mjs',
  '.claude/hooks/lib/common.mjs',
  '.claude/hooks/lib/write-set-profile.mjs',
  '.claude/hooks/lib/write-surface.mjs',
  '.claude/hooks/spec_design_calls_guard.mjs',
  '.claude/skills/harness/rightsize-gate.mjs',
  '.claude/skills/triage/governance-class.mjs',
  '.claude/skills/spec-lint/lint.mjs',
];

describe('glob-match — module surface (AC-001)', () => {
  it('test_when_module_imported_then_exports_the_documented_surface', async () => {
    const m = await importGlobMatch();
    for (const name of ['globToRegex', 'matchesAnyGlob', 'expandBraces']) {
      assert.equal(typeof m[name], 'function', `${name} must be exported as a function`);
    }
    assert.equal(m.MAX_STAR_RUN, 3, 'MAX_STAR_RUN is the longest run write-surface.mjs still accepts');
    assert.equal(m.MAX_UNBOUNDED_SEGMENTS, 5, 'MAX_UNBOUNDED_SEGMENTS is the refusal threshold');

    // A foundation module that imports from .claude/ is no longer a leaf, and the
    // dependency graph in the spec asserts it is one.
    const src = readFileSync(join(REPO_ROOT, MODULE_REL), 'utf8');
    const offenders = [...src.matchAll(/^\s*import\s[^;]*?from\s+['"]([^'"]+)['"]/gm)]
      .map((mm) => mm[1])
      .filter((spec) => !spec.startsWith('node:'));
    assert.deepEqual(offenders, [], 'glob-match.mjs must import nothing but node builtins');
  });

  it('test_when_default_options_then_compiles_anchored_regex', async () => {
    const { globToRegex } = await importGlobMatch();
    const r = globToRegex('src/**/*.mjs');
    assert.ok(r.source.startsWith('^') && r.source.endsWith('$'), 'the pattern must be anchored both ends');
    assert.equal(r.test('src/a/b.mjs'), true);
    assert.equal(r.test('src/a/b.js'), false);
  });

  it('test_when_edge_globs_compiled_then_no_throw', async () => {
    const { globToRegex } = await importGlobMatch();
    for (const g of ['', '*', '**']) {
      const r = globToRegex(g);
      assert.ok(r instanceof RegExp, `${JSON.stringify(g)} must compile`);
      assert.ok(r.source.startsWith('^') && r.source.endsWith('$'), `${JSON.stringify(g)} must anchor`);
    }
  });

  it('test_when_glob_not_string_then_throws_typeerror', async () => {
    const { globToRegex } = await importGlobMatch();
    // TypeError and RangeError are deliberately distinct: wrong type vs refused shape.
    assert.throws(() => globToRegex(null), TypeError);
    assert.throws(() => globToRegex(42), TypeError);
  });

  it('test_when_globs_not_array_then_returns_false', async () => {
    const { matchesAnyGlob } = await importGlobMatch();
    assert.equal(matchesAnyGlob('p', null), false);
    assert.equal(matchesAnyGlob('p', undefined), false);
  });

  it('test_when_unknown_option_key_then_default_dialect_used', async () => {
    const { globToRegex } = await importGlobMatch();
    const withBogus = globToRegex('a/**/b', { nosuchOption: true });
    const plain = globToRegex('a/**/b');
    assert.equal(withBogus.source, plain.source, 'an unrecognized option must not change the dialect');
  });
});

describe('glob-match — behavior preservation per consumer (AC-003)', () => {
  it('test_when_corpus_glob_compiled_then_source_matches_that_consumers_pre_hoist_copy', async () => {
    const { globToRegex } = await importGlobMatch();
    const corpus = readJson('tests/fixtures/glob-corpus.json');

    const consumers = Object.keys(corpus);
    assert.ok(consumers.length >= 4, 'the corpus is keyed per consumer, not shared');

    const drifted = [];
    let compared = 0;
    for (const [consumer, block] of Object.entries(corpus)) {
      for (const { glob, expected_source } of block.entries) {
        compared += 1;
        const actual = globToRegex(glob, block.options).source;
        if (actual !== expected_source) {
          drifted.push(`${consumer} ${JSON.stringify(glob)}: ${actual} (was ${expected_source})`);
        }
      }
    }
    assert.ok(compared >= 40, `the corpus must cover at least 40 globs; covered ${compared}`);
    assert.deepEqual(drifted, [], 'a hoist must not change what any consumer compiles');
  });
});

describe('glob-match — the admissible worst case stays bounded (AC-002)', () => {
  it('test_when_admissible_worst_case_compiled_then_the_match_stays_bounded', async () => {
    const { globToRegex, MAX_UNBOUNDED_SEGMENTS } = await importGlobMatch();

    // Four segments: one below the bound, and the most this module can still be
    // asked to compile. A 60-star run is NOT probed — AC-008 refuses it, so the
    // two criteria could never both pass. No leading literal, so the probe
    // engages rather than failing at position 0 (see the sibling test).
    const segments = MAX_UNBOUNDED_SEGMENTS - 1;
    const r = globToRegex('**x'.repeat(segments) + 'b');
    assert.equal(r.source, `^${'.*x'.repeat(segments)}b$`);

    // 96 ms measured in isolation, 429 ms inside the full parallel suite. The
    // ceiling clears that load and still sits ~20x under the six-segment cost,
    // so what it detects is a bound raised without re-measuring — not jitter.
    const ms = elapsedMs(() => assert.equal(r.test('x'.repeat(120)), false));
    assert.ok(ms <= 2000, `expected <= 2000 ms at ${segments} segments, got ${ms.toFixed(1)} ms (6 segments cost 45,952 ms)`);
  });

  it('test_when_probe_carries_a_leading_literal_then_it_is_documented_as_not_an_oracle', () => {
    // The pre-amendment AC-002 used `a` + 60 stars + `b`. Against an all-x path
    // that returns in milliseconds even on a deliberately broken compiler, because
    // it fails at the leading `a` before exploring anything. The reference compiler
    // below is inlined rather than imported: it reproduces the pre-hoist per-pair
    // emit that this workflow deletes, so the anti-pattern stays demonstrable after
    // every private copy is gone.
    const uncollapsed = (glob) => {
      let out = '';
      for (let i = 0; i < glob.length; i++) {
        const c = glob[i];
        if (c === '*') {
          if (glob[i + 1] === '*') { out += '.*'; i++; } else out += '[^/]*';
        } else if ('.+()|^$\\[]{}'.includes(c)) out += '\\' + c;
        else out += c;
      }
      return new RegExp('^' + out + '$');
    };

    const misleading = uncollapsed('a' + '*'.repeat(60) + 'b');
    const ms = elapsedMs(() => misleading.test('x'.repeat(120)));
    assert.ok(
      ms <= 50,
      `the anti-pattern must stay fast to remain a demonstration; got ${ms.toFixed(1)} ms`,
    );
    assert.ok(
      misleading.source.startsWith('^a'),
      'the leading literal is the whole point: it lets the path fail at position 0',
    );
  });
});

describe('glob-match — opt-in dialects (AC-004, AC-005)', () => {
  it('test_when_segment_globstar_then_readme_matches', async () => {
    const { matchesAnyGlob } = await importGlobMatch();
    assert.equal(matchesAnyGlob('README.md', ['**/*.md'], { segmentGlobstar: true }), true);
    assert.equal(matchesAnyGlob('README.md', ['**/*.md']), false);
    // The nested case must keep working under both dialects.
    assert.equal(matchesAnyGlob('docs/a.md', ['**/*.md'], { segmentGlobstar: true }), true);
    assert.equal(matchesAnyGlob('docs/a.md', ['**/*.md']), true);
  });

  it('test_when_char_class_enabled_then_bracket_is_class', async () => {
    const { globToRegex } = await importGlobMatch();
    assert.equal(globToRegex('release-[0-9]', { charClass: true }).test('release-7'), true);
    assert.equal(globToRegex('release-[0-9]').test('release-7'), false);
    assert.equal(globToRegex('release-[0-9]').test('release-[0-9]'), true);
  });

  it('test_when_unterminated_bracket_then_escaped_literal', async () => {
    const { globToRegex } = await importGlobMatch();
    for (const options of [{ charClass: true }, {}]) {
      const r = globToRegex('release-[0-9', options);
      assert.equal(r.test('release-[0-9'), true, `unterminated [ must be a literal under ${JSON.stringify(options)}`);
    }
  });
});

describe('glob-match — the residual the collapse cannot bound is refused (AC-008)', () => {
  it('test_when_star_run_is_long_then_it_collapses_rather_than_being_refused', async () => {
    const { globToRegex } = await importGlobMatch();
    // The compiler does NOT bound star runs. Collapsing already costs 0.0 ms, and
    // two shipped tests (memory-scope-relevance-filter) assert exactly this
    // collapse — refusing here would contradict them for no measured gain.
    const two = globToRegex('a**b').source;
    assert.equal(globToRegex('a***b').source, two);
    assert.equal(globToRegex('a' + '*'.repeat(60) + 'b').source, two);
    assert.notEqual(globToRegex('a*b').source, two, 'a single star keeps its own meaning');
  });

  it('test_when_star_run_exceeds_the_bound_then_the_declaration_boundary_drops_it', async () => {
    const { MAX_STAR_RUN } = await importGlobMatch();
    const { sanitizePatterns } = await import(
      `${pathToFileURL(join(REPO_ROOT, '.claude/hooks/lib/write-surface.mjs')).href}?t=${process.hrtime.bigint()}`
    );
    // MAX_STAR_RUN lives in glob-match.mjs but is enforced one layer out, where a
    // human declared the surface — a member this shape is malformed, not slow.
    const ok = 'src/' + '*'.repeat(MAX_STAR_RUN) + '/x';
    const bad = 'src/' + '*'.repeat(MAX_STAR_RUN + 1) + '/x';
    assert.deepEqual(sanitizePatterns([ok]), [ok], `a run of ${MAX_STAR_RUN} is still declarable`);
    assert.deepEqual(sanitizePatterns([bad]), [], `a run of ${MAX_STAR_RUN + 1} is dropped`);
  });

  it('test_when_unbounded_segments_reach_the_bound_then_compile_is_refused', async () => {
    const { globToRegex, MAX_UNBOUNDED_SEGMENTS } = await importGlobMatch();
    const glob = (n) => '**x'.repeat(n) + 'b';

    const ok = globToRegex(glob(MAX_UNBOUNDED_SEGMENTS - 1));
    assert.ok(ok instanceof RegExp, 'one below the bound compiles');
    // Four segments measured 96 ms; the ceiling here is loose because this
    // assertion is about admissibility, not about the timing AC.
    const ms = elapsedMs(() => ok.test('x'.repeat(120)));
    assert.ok(ms <= 1000, `the admissible worst case must stay usable; got ${ms.toFixed(1)} ms`);

    assert.throws(
      () => globToRegex(glob(MAX_UNBOUNDED_SEGMENTS)),
      (err) => err instanceof RangeError && /segment/i.test(err.message),
      'at the bound it must throw a RangeError naming the segment bound',
    );
  });

  it('test_when_range_error_raised_in_a_member_then_it_propagates_through_matchesAnyGlob', async () => {
    const { matchesAnyGlob } = await importGlobMatch();
    // Swallowing this would restore the silent hang the bound exists to remove.
    assert.throws(
      () => matchesAnyGlob('p', ['***x***x***x***x***x***xb']),
      RangeError,
      'a refused member must not be reported as "no match"',
    );
  });

  it('test_when_live_project_globs_compiled_then_none_is_refused', async () => {
    const { globToRegex } = await importGlobMatch();
    const p = readJson('.claude/project.json');
    const declared = [
      ...(p.tdd?.source_globs ?? []),
      ...(p.tdd?.test_globs ?? []),
      ...(p.tdd?.exempt_globs ?? []),
      ...(p.tdd?.ui_globs ?? []),
      ...(p.security?.sensitive_globs ?? []),
      ...(p.test?.file_globs ?? []),
      ...(p.lint?.file_globs ?? []),
      ...(p.artifacts?.diagram_profiles ?? []).flatMap((x) => x.when ?? []),
    ];
    const globs = [...new Set(declared)];
    assert.ok(globs.length >= 40, `expected the live config to declare 40+ globs; found ${globs.length}`);

    const refused = [];
    for (const g of globs) {
      try { globToRegex(g); } catch (err) { refused.push(`${g}: ${err.message}`); }
    }
    assert.deepEqual(refused, [], 'a bound that refuses real config is tighter than the measurement justified');
  });
});

describe('glob-match — one definition survives (AC-006, AC-007)', () => {
  it('test_when_write_set_scanned_then_only_glob_match_defines_globtoregex', () => {
    const definers = [];
    for (const rel of CONSUMER_MODULES) {
      const abs = join(REPO_ROOT, rel);
      if (!existsSync(abs)) continue;
      readFileSync(abs, 'utf8').split('\n').forEach((line, i) => {
        if (/(?:function|const)\s+globToRegex\b/.test(line)) definers.push(`${rel}:${i + 1}`);
      });
    }
    assert.deepEqual(
      definers,
      [`${MODULE_REL}:${definers.find((d) => d.startsWith(MODULE_REL))?.split(':')[1] ?? '?'}`],
      `exactly one module may define globToRegex; found ${definers.length}: ${definers.join(', ')}`,
    );
  });

  it('test_when_manifest_read_then_glob_match_is_listed', () => {
    const rel = 'obj/template/.claude/manifest.json';
    assert.ok(
      existsSync(join(REPO_ROOT, rel)),
      `${rel} is absent — run \`bash scripts/build-template.sh --manifest-only\`. This test does not skip: a consumer install without the module cannot resolve the import.`,
    );
    const manifest = readJson(rel);
    const entry = manifest.files?.[MODULE_REL];
    assert.ok(entry, `${MODULE_REL} must appear in the shipped manifest — run \`bash scripts/build-template.sh --manifest-only\``);
    assert.match(entry.sha256 ?? '', /^[0-9a-f]{64}$/, 'the manifest entry must carry a sha256');
  });
});
