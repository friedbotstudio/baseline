// Regression tests for the three MEDIUM findings in
// docs/security/living-system-model-abcd-2026-08-04.md.
//
// Each was confirmed by execution during the security review, so each must go RED
// against the pre-fix code. They are grouped in one file because they share a root
// cause worth keeping visible: F-1 and F-2 both apply a regex at a wider scope than
// intended (whole file / whole category where one frontmatter block or one entry was
// meant), and F-3 is the same failure to bound an input before it crosses into a
// structured file.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { makeProject, writeShard, tryImport } from './helpers/memory-fixtures.mjs';

const INDEX_IO = '.claude/skills/memory-index/index-io.mjs';
const RESOLVE = '.claude/skills/memory-index/resolve.mjs';
const GOVERNED = '.claude/hooks/lib/governed-memory.mjs';
const LEDGER = '.claude/skills/memory-flush/ledger.mjs';

describe('security follow-up — F-1: malformed governs glob', () => {
  it('test_when_governs_glob_holds_regex_metachar_then_match_returns_false_not_throws', async () => {
    const mod = await tryImport(INDEX_IO);
    assert.ok(mod, `${INDEX_IO} must be importable`);

    // '?' reached new RegExp() unescaped and raised "Nothing to repeat".
    for (const glob of ['?', 'a?', '?*', 'src/?.js']) {
      let out;
      assert.doesNotThrow(() => {
        out = mod.matchesGlob(glob, 'src/a.js');
      }, `matchesGlob must not throw on glob ${JSON.stringify(glob)} — it is frontmatter content, not a trusted pattern`);
      assert.equal(typeof out, 'boolean', 'a glob match always resolves to a boolean');
    }
  });

  it('test_when_one_entry_has_bad_glob_then_sibling_entries_still_surface', async () => {
    const project = makeProject();
    try {
      writeShard(project.memDir, 'decisions', 'hostile', {
        key: 'hostile', fields: { governs: '?' }, bodyLines: ['- Decision: bad glob.'],
      });
      writeShard(project.memDir, 'decisions', 'healthy', {
        key: 'healthy', fields: { governs: 'src/**' }, bodyLines: ['> verbatim: healthy sibling'],
      });

      const mod = await tryImport(GOVERNED);
      assert.ok(mod, `${GOVERNED} must be importable`);

      const hits = mod.surfaceGovernedMemory('src/a.js', { rootDir: project.root });
      assert.deepEqual(
        hits.map((h) => h.key),
        ['healthy'],
        'a single malformed glob must not suppress its siblings — the per-category try previously swallowed the whole decisions/ category, so an advisory control failed closed and silently',
      );
    } finally {
      rmSync(project.root, { recursive: true, force: true });
    }
  });

  it('test_when_governs_glob_is_malformed_then_resolve_lookup_honors_never_throws', async () => {
    const project = makeProject();
    try {
      writeShard(project.memDir, 'decisions', 'hostile', { key: 'hostile', fields: { governs: '?' } });

      const mod = await tryImport(RESOLVE);
      assert.ok(mod, `${RESOLVE} must be importable`);

      let out;
      assert.doesNotThrow(() => {
        out = mod.resolveLookup('by_path', 'src/a.js', { rootDir: project.root });
      }, 'resolveLookup is contracted never to throw; a malformed governs: glob must not break that');
      assert.ok(Array.isArray(out), 'resolveLookup always returns an array');
    } finally {
      rmSync(project.root, { recursive: true, force: true });
    }
  });
});

describe('security follow-up — F-2: scope probe must be frontmatter-scoped', () => {
  it('test_when_body_contains_scope_line_then_frontmatter_backfill_still_applies', async () => {
    const project = makeProject();
    try {
      // No scope: in frontmatter, but a body line begins with `scope:` — plausible
      // in this corpus, where entries quote frontmatter keys while documenting the
      // schema. The unanchored /m probe read that body line and skipped the entry.
      const path = join(project.memDir, 'decisions', 'schema-doc.md');
      writeShard(project.memDir, 'decisions', 'schema-doc', { key: 'schema-doc' });
      writeFileSync(path, [
        '---',
        'key: schema-doc',
        'category: decisions',
        '---',
        '',
        '- Decision: document the entry schema.',
        'scope: this line is prose describing the field, not the field itself',
        '',
      ].join('\n'), 'utf8');

      const mod = await tryImport(RESOLVE);
      assert.ok(mod, `${RESOLVE} must be importable`);

      const report = mod.backfillScopeAny({ rootDir: project.root });
      assert.equal(
        report.updated,
        1,
        'the entry has no frontmatter scope and must be backfilled — a body line beginning "scope:" is prose, and treating it as the field leaves the fact unreachable, the exact condition AC-011 and prerequisite P2 forbid',
      );
    } finally {
      rmSync(project.root, { recursive: true, force: true });
    }
  });

  it('test_when_backfill_runs_then_body_prose_is_left_byte_identical', async () => {
    const project = makeProject();
    try {
      const path = join(project.memDir, 'decisions', 'body-intact.md');
      writeShard(project.memDir, 'decisions', 'body-intact', { key: 'body-intact' });
      const body = [
        '- Decision: the body mentions key: and scope: as documentation.',
        'key: a prose line that must not become an insertion point',
        '',
      ].join('\n');
      writeFileSync(path, `---\nkey: body-intact\ncategory: decisions\n---\n\n${body}`, 'utf8');

      const mod = await tryImport(RESOLVE);
      assert.ok(mod, `${RESOLVE} must be importable`);
      mod.backfillScopeAny({ rootDir: project.root });

      const after = (await import('node:fs')).readFileSync(path, 'utf8');
      assert.ok(
        after.endsWith(body),
        'the backfill rewrites frontmatter only; body prose mentioning key:/scope: must survive byte-identical',
      );
      assert.match(after.split('---')[1], /^scope: any$/m, 'scope lands in the frontmatter block');
    } finally {
      rmSync(project.root, { recursive: true, force: true });
    }
  });
});

describe('security follow-up — F-3: ledger key must be bounded', () => {
  it('test_when_curation_key_contains_newline_then_rejected_not_written', async () => {
    const project = makeProject();
    try {
      const mod = await tryImport(LEDGER);
      assert.ok(mod, `${LEDGER} must be importable`);

      const accepted = mod.recordCuration(
        { key: 'evil\n- discarded :: unrelated-victim', disposition: 'discarded' },
        { rootDir: project.root },
      );
      assert.equal(accepted, false, 'a key carrying a newline is rejected, matching the existing rejection path');

      const read = mod.readLedger({ rootDir: project.root });
      assert.ok(
        !read.discarded.includes('unrelated-victim'),
        'a forged row must never reach the ledger — decidedKeys() feeds memory_stop suppression, so an injected key permanently silences an unrelated future candidate',
      );
      assert.deepEqual(read.discarded, [], 'nothing at all is written for a rejected key');
    } finally {
      rmSync(project.root, { recursive: true, force: true });
    }
  });
});
