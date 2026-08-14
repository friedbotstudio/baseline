// Scenarios for the relevance filter over the declared write surface
// (Epic 6 T11). Covers AC-001..AC-009 of
// docs/specs/epic6-t11-landmark-scope-rehome.md.
//
// RED until write-surface.mjs lands, scoped-memory.mjs exports entryPaths and
// accepts writeSurface, and write-set-profile.mjs exports the two predicates.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = join(dirname(__filename), '..');

// Node's ESM loader caches by URL; the query string keeps each import fresh so a
// suite that seeds different roots does not read the first evaluation.
function freshImport(relPath) {
  const href = pathToFileURL(join(REPO_ROOT, relPath)).href;
  return import(`${href}?t=${process.hrtime.bigint()}`);
}

const importScoped = () => freshImport('.claude/hooks/lib/scoped-memory.mjs');
const importSurface = () => freshImport('.claude/hooks/lib/write-surface.mjs');
const importProfile = () => freshImport('.claude/hooks/lib/write-set-profile.mjs');

const PHASE = 'scout';

function landmark({ key, governs, loadBearing }) {
  const governsLine = governs ? `governs: ${governs}\n` : '';
  const marker = loadBearing ? '\n- load_bearing: true\n' : '';
  return `---
key: ${key}
category: landmarks
scope: [${PHASE}]
${governsLine}verified-at: abc1234
last-touched: 2026-08-14
---

> verbatim (landmark, 2026-08-14):
> the standing shape of ${key}

- Role: fixture entry for the relevance filter suite.${marker}`;
}

// Filenames are slugified because a landmark key is a path and a path is not a
// legal filename; resolveCategory reads the key from the frontmatter, not the name.
function slugify(key) {
  return key.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase();
}

function seedStore(entries) {
  const root = mkdtempSync(join(tmpdir(), 'mem-relevance-'));
  const dir = join(root, '.claude/memory/landmarks');
  mkdirSync(dir, { recursive: true });
  for (const entry of entries) {
    writeFileSync(join(dir, `${slugify(entry.key)}.md`), landmark(entry));
  }
  return root;
}

function writeWorkflowJson(root, body) {
  const dir = join(root, '.claude/state');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'workflow.json'), body);
}

const INSIDE_GOVERNS = '.claude/hooks/lib/alpha.mjs';
const INSIDE_KEYED = '.claude/hooks/lib/beta.mjs:12';
const OUTSIDE_KEYED = '.claude/skills/gamma/delta.mjs:7';
const NO_SIGNAL = 'durable-plan-state-subsystem-424f';

const MIXED_STORE = [
  { key: INSIDE_GOVERNS, governs: '.claude/hooks/lib/alpha.mjs' },
  { key: INSIDE_KEYED },
  { key: OUTSIDE_KEYED },
];

describe('relevance filter — a declared surface narrows the phase leg (AC-001)', () => {
  it('test_when_surface_declared_then_only_overlapping_hits_return', async () => {
    const root = seedStore(MIXED_STORE);
    try {
      const { surfaceScopedMemory } = await importScoped();
      const narrowed = surfaceScopedMemory(PHASE, {
        rootDir: root,
        writeSurface: ['.claude/hooks/**'],
      });
      const keys = narrowed.map((h) => h.key);

      assert.ok(keys.includes(INSIDE_GOVERNS), 'a governs: match inside the surface survives');
      assert.ok(keys.includes(INSIDE_KEYED), 'a path-keyed entry inside the surface survives');
      assert.ok(!keys.includes(OUTSIDE_KEYED), 'a path-keyed entry outside the surface is dropped');

      const unfiltered = surfaceScopedMemory(PHASE, { rootDir: root });
      assert.ok(
        unfiltered.length > narrowed.length,
        'the narrowed call returns strictly fewer hits than the unfiltered one',
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('test_when_surface_is_a_glob_or_a_bare_directory_then_both_overlap', async () => {
    const { pathOverlapsWriteSet } = await importProfile();
    assert.equal(
      pathOverlapsWriteSet('.claude/hooks/lib/x.mjs', ['.claude/hooks/**']),
      true,
      'a ** glob covers a file nested beneath it',
    );
    assert.equal(
      pathOverlapsWriteSet('.claude/hooks/lib/x.mjs', ['.claude/hooks/']),
      true,
      'a bare directory covers a file beneath it',
    );
    assert.equal(
      pathOverlapsWriteSet('.claude/skills/x.mjs', ['.claude/hooks/**']),
      false,
      'a sibling directory does not overlap',
    );
  });
});

describe('relevance filter — the path signal comes from governs: then the key (AC-004)', () => {
  it('test_when_entry_declares_governs_then_governs_wins_over_the_key', async () => {
    const { entryPaths } = await importScoped();
    const paths = entryPaths({
      key: '.claude/hooks/lib/a.mjs:51',
      fields: { governs: '.claude/skills/**' },
    });
    assert.deepEqual(paths, ['.claude/skills/**'], 'governs: is the signal when present');
  });

  it('test_when_key_is_path_shaped_then_the_line_suffix_is_stripped', async () => {
    const { entryPaths } = await importScoped();
    assert.deepEqual(
      entryPaths({ key: '.claude/hooks/lib/governed-memory.mjs:51', fields: {} }),
      ['.claude/hooks/lib/governed-memory.mjs'],
      'the :<line> suffix is not part of the path',
    );
  });
});

describe('relevance filter — no usable surface falls open (AC-002)', () => {
  it('test_when_no_surface_is_declared_then_the_result_is_the_unfiltered_set', async () => {
    const cases = [
      ['write_surface absent', '{"slug":"s","track_id":"spec-entry"}'],
      ['write_surface empty', '{"slug":"s","write_surface":[]}'],
      ['workflow.json invalid', '{ not json at all'],
    ];
    for (const [label, body] of cases) {
      const root = seedStore(MIXED_STORE);
      try {
        writeWorkflowJson(root, body);
        const { surfaceScopedMemory } = await importScoped();
        const { readWriteSurface } = await importSurface();
        const surface = readWriteSurface({ rootDir: root });
        assert.deepEqual(
          surfaceScopedMemory(PHASE, { rootDir: root, writeSurface: surface }),
          surfaceScopedMemory(PHASE, { rootDir: root }),
          `${label} yields the unfiltered set`,
        );
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    }
  });

  it('test_when_workflow_json_is_missing_then_the_surface_reads_empty', async () => {
    const root = seedStore(MIXED_STORE);
    try {
      const { readWriteSurface } = await importSurface();
      assert.deepEqual(readWriteSurface({ rootDir: root }), [], 'no state file -> no surface');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('test_when_narrowing_applies_then_rank_order_is_preserved', async () => {
    const root = seedStore([
      { key: '.claude/hooks/lib/zulu.mjs:1', loadBearing: false },
      { key: '.claude/hooks/lib/alpha.mjs:1', loadBearing: true },
      { key: '.claude/hooks/lib/mike.mjs:1', loadBearing: false },
      { key: '.claude/hooks/lib/bravo.mjs:1', loadBearing: true },
    ]);
    try {
      const { surfaceScopedMemory } = await importScoped();
      const narrowed = surfaceScopedMemory(PHASE, {
        rootDir: root,
        writeSurface: ['.claude/hooks/**'],
      });
      assert.deepEqual(
        narrowed.map((h) => h.key),
        surfaceScopedMemory(PHASE, { rootDir: root }).map((h) => h.key),
        'every entry is inside the surface, so narrowing changes nothing about order',
      );
      assert.deepEqual(
        narrowed.map((h) => h.load_bearing),
        [true, true, false, false],
        'load-bearing entries still lead after narrowing',
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('relevance filter — a missing path signal never hides a fact (AC-003)', () => {
  it('test_when_entry_has_no_path_signal_then_it_survives_narrowing', async () => {
    const root = seedStore([{ key: NO_SIGNAL }, { key: OUTSIDE_KEYED }]);
    try {
      const { surfaceScopedMemory } = await importScoped();
      const keys = surfaceScopedMemory(PHASE, {
        rootDir: root,
        writeSurface: ['.claude/hooks/**'],
      }).map((h) => h.key);

      assert.ok(keys.includes(NO_SIGNAL), 'a signal-less entry is never dropped');
      assert.ok(!keys.includes(OUTSIDE_KEYED), 'an entry with a signal that misses is dropped');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('test_when_entry_has_no_path_signal_then_entry_paths_is_empty', async () => {
    const { entryPaths } = await importScoped();
    assert.deepEqual(entryPaths({ key: NO_SIGNAL, fields: {} }), [], 'no signal -> no paths');
  });
});

describe('relevance filter — a hostile surface member never reaches the matcher (AC-006)', () => {
  it('test_when_a_surface_member_is_hostile_then_it_is_dropped_before_matching', async () => {
    const root = seedStore(MIXED_STORE);
    try {
      writeWorkflowJson(
        root,
        JSON.stringify({ write_surface: ['/etc/passwd', '../../secrets', 42, null] }),
      );
      const { readWriteSurface } = await importSurface();
      assert.deepEqual(
        readWriteSurface({ rootDir: root }),
        [],
        'absolute paths, .. segments and non-strings are all dropped',
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('test_when_a_surface_mixes_hostile_and_valid_members_then_only_the_valid_survive', async () => {
    const root = seedStore(MIXED_STORE);
    try {
      writeWorkflowJson(
        root,
        JSON.stringify({ write_surface: ['../escape', '.claude/hooks/**', '/abs/path'] }),
      );
      const { readWriteSurface } = await importSurface();
      assert.deepEqual(
        readWriteSurface({ rootDir: root }),
        ['.claude/hooks/**'],
        'a valid member is kept alongside dropped ones',
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('test_when_write_surface_is_not_an_array_then_it_reads_as_undeclared', async () => {
    for (const shape of ['a string', { glob: 'x' }, null, 7]) {
      const root = seedStore(MIXED_STORE);
      try {
        writeWorkflowJson(root, JSON.stringify({ write_surface: shape }));
        const { readWriteSurface } = await importSurface();
        assert.deepEqual(
          readWriteSurface({ rootDir: root }),
          [],
          `write_surface as ${JSON.stringify(shape)} reads as undeclared`,
        );
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    }
  });
});

// AC-010 / AC-011 were added by amendment after the security review measured
// 133,913 ms for one match against a 60-star pattern (CWE-1333). Two layers:
// the bound refuses absurd input on the new write_surface path, and the matcher
// fix also covers the two pre-existing project.json callers.
describe('relevance filter — a pathological glob is refused at the boundary (AC-010)', () => {
  it('test_when_surface_member_has_a_long_star_run_then_it_is_dropped', async () => {
    const root = seedStore(MIXED_STORE);
    try {
      writeWorkflowJson(
        root,
        JSON.stringify({ write_surface: [`${'*'.repeat(60)}x`, '.claude/hooks/**'] }),
      );
      const { readWriteSurface } = await importSurface();
      assert.deepEqual(
        readWriteSurface({ rootDir: root }),
        ['.claude/hooks/**'],
        'the 60-star member never reaches the matcher; the ordinary glob survives',
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('test_when_ordinary_globs_are_declared_then_the_bound_keeps_them', async () => {
    const { sanitizePatterns } = await importSurface();
    const ordinary = ['**/', '.claude/hooks/**', 'a/**/b', '.claude/skills/*/SKILL.md', 'src/**'];
    assert.deepEqual(
      sanitizePatterns(ordinary),
      ordinary,
      'the bound refuses runs above three stars, not ordinary globs',
    );
  });
});

describe('relevance filter — the matcher cannot backtrack (AC-011)', () => {
  it('test_when_sixty_star_pattern_matched_then_it_returns_promptly', async () => {
    const { pathOverlapsWriteSet } = await importProfile();
    const victim = `.claude/hooks/lib/${'a'.repeat(400)}.mjs`;
    const started = process.hrtime.bigint();
    pathOverlapsWriteSet(victim, [`${'*'.repeat(60)}x`]);
    const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6;
    assert.ok(
      elapsedMs < 100,
      `a 60-star pattern must not backtrack — took ${elapsedMs.toFixed(1)}ms (pre-fix: 133913ms)`,
    );
  });

  it('test_when_star_runs_compile_then_three_and_four_stars_equal_two', async () => {
    const { globToRegex } = await importProfile();
    const two = globToRegex('a**b').source;
    assert.equal(globToRegex('a***b').source, two, 'three stars collapse to two');
    assert.equal(globToRegex('a****b').source, two, 'four stars collapse to two');
    assert.notEqual(globToRegex('a*b').source, two, 'a single star keeps its own meaning');
  });

  it('test_when_existing_project_json_callers_resolve_then_profiles_are_unchanged', async () => {
    const { resolveProfile } = await importProfile();
    const project = JSON.parse(readFileSync(join(REPO_ROOT, '.claude/project.json'), 'utf8'));
    // resolveProfile calls projectGet with a LEADING-DOT path ('.artifacts.…'),
    // so the empty first segment has to be dropped or every lookup reads undefined.
    const projectGet = (path) =>
      path.split('.').filter(Boolean).reduce((node, key) => node?.[key], project);

    const nonArchitectural = resolveProfile('**Write set**: `.claude/skills/**`, `docs/**`', projectGet);
    const architectural = resolveProfile('**Write set**: `src/cli/install.js`', projectGet);

    assert.equal(
      nonArchitectural.id,
      'non-architectural',
      'a docs/skills write_set still reduces — the diagram_profiles[].when matcher is behaviour-preserving',
    );
    assert.equal(
      architectural.id,
      'full',
      'a security.sensitive_globs path still forces the full set — that matcher is behaviour-preserving too',
    );
  });
});

describe('relevance filter — one primitive, two predicates (AC-005)', () => {
  it('test_when_optimize_is_read_then_it_declares_no_local_overlap_helpers', () => {
    const src = readFileSync(join(REPO_ROOT, '.claude/skills/spec/optimize.mjs'), 'utf8');
    assert.ok(
      !/function\s+overlapsWriteSet\b/.test(src),
      'optimize.mjs keeps no local overlapsWriteSet',
    );
    assert.ok(
      !/function\s+directoryPrefix\b/.test(src),
      'optimize.mjs keeps no local directoryPrefix',
    );
    assert.ok(
      /import\s*\{[^}]*\bpatternsOverlap\b[^}]*\}\s*from\s*'[^']*write-set-profile\.mjs'/.test(src),
      'optimize.mjs imports patternsOverlap from the hooks lib',
    );
  });

  it('test_when_the_two_predicates_are_compared_then_path_overlap_is_stricter', async () => {
    const { pathOverlapsWriteSet, patternsOverlap } = await importProfile();
    const surface = ['.claude/hooks/lib/scoped-memory.mjs'];
    const sibling = '.claude/hooks/lib/governed-memory.mjs';

    assert.equal(
      pathOverlapsWriteSet(sibling, surface),
      false,
      'a sibling file is NOT inside a surface naming one file',
    );
    assert.equal(
      patternsOverlap(sibling, surface[0]),
      true,
      'the bidirectional predicate still reports the directory overlap',
    );
  });
});

describe('relevance filter — the declaration surfaces are documented (AC-007, AC-008)', () => {
  it('test_when_triage_skill_is_read_then_it_documents_the_write_surface_field', () => {
    const src = readFileSync(join(REPO_ROOT, '.claude/skills/triage/SKILL.md'), 'utf8');
    assert.ok(src.includes('write_surface'), 'triage SKILL.md names the write_surface field');
    assert.ok(
      /write_surface[\s\S]{0,600}?(omit|absent|omission)/i.test(src),
      'triage SKILL.md states that omitting the field is the fail-open default',
    );
  });

  it('test_when_the_t11_row_is_read_then_it_quotes_no_count', () => {
    const roadmap = readFileSync(join(REPO_ROOT, 'docs/roadmap-execution-plan.md'), 'utf8');
    const row = roadmap.split(/\r?\n/).find((line) => /^-\s*[⬜🟡✅]\s*T11\./.test(line.trim()));
    assert.ok(row, 'the T11 row is findable');

    assert.ok(
      !/\b\d+\s+landmarks?\b/i.test(row),
      'T11 quotes no landmark count',
    );
    assert.ok(
      !/\b(?:surfaces?|surfaced)\s+\d+\b/i.test(row),
      'T11 quotes no surfaced-fact count',
    );
    assert.ok(
      row.includes('tests/memory-scope-store-invariants.test.mjs'),
      'T11 names the test as the oracle instead of copying its number',
    );
  });
});
