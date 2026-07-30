// T2 — a shipped-count claim must be derived from the SHIPPED template, never
// from the live dev tree. This is the defect that let the site assert "9
// selectable tracks ship in the pristine template" while the template shipped 8.
//
// RED until derive-counts.mjs grows a source-selecting countTracks.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DERIVE = path.join(REPO_ROOT, '.claude/skills/audit-baseline/derive-counts.mjs');

const mod = await import(pathToFileURL(DERIVE).href);

// Named-export guard: countTracks does not exist yet, and a bare destructure
// would die with an opaque "not a function" that names nothing.
function fn(name) {
  assert.equal(typeof mod[name], 'function', `expected named export \`${name}\` to be a function`);
  return mod[name];
}

const selectableIn = (file) =>
  readFileSync(file, 'utf8')
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l))
    .filter((t) => t.selectable === true).length;

const TEMPLATE_JSONL = path.join(REPO_ROOT, 'obj/template/.claude/workflows.jsonl');
const LIVE_JSONL = path.join(REPO_ROOT, '.claude/workflows.jsonl');

describe('T2 — track counts derive from the shipped template', () => {
  it('test_when_template_present_then_counts_derive_from_template', () => { // AC-005
    const countTracks = fn('countTracks');
    const result = countTracks(REPO_ROOT, { source: 'template' });
    assert.equal(
      result.canonical,
      selectableIn(TEMPLATE_JSONL),
      'countTracks must report the shipped template selectable count',
    );
    assert.equal(result.source, 'template', 'result must record which tree it counted');
  });

  it('test_when_template_absent_then_falls_back_to_live_and_marks_source', () => { // AC-005
    const countTracks = fn('countTracks');
    const tmp = mkdtempSync(path.join(tmpdir(), 'count-truth-'));
    try {
      mkdirSync(path.join(tmp, '.claude'), { recursive: true });
      writeFileSync(
        path.join(tmp, '.claude/workflows.jsonl'),
        [
          JSON.stringify({ track_id: 'a', selectable: true, nodes: [] }),
          JSON.stringify({ track_id: 'b', selectable: false, nodes: [] }),
        ].join('\n'),
      );
      const result = countTracks(tmp, { source: 'template' });
      assert.equal(result.canonical, 1, 'must fall back to the live tree when no template exists');
      assert.equal(result.source, 'live', 'fallback must mark source=live so callers can tell');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('test_when_site_claims_shipped_count_then_audit_matches_template', () => { // AC-006
    const templateCount = selectableIn(TEMPLATE_JSONL);
    const claims = [];
    for (const rel of ['site-src/workflows.njk', 'site-src/index.njk']) {
      const src = path.join(REPO_ROOT, rel);
      if (!existsSync(src)) continue;
      const text = readFileSync(src, 'utf8');
      // Capture ONLY the token immediately before the claim phrase: a bare
      // number, or a single {{ ... }} interpolation. A greedy [\w.{} ]+
      // swallows the preceding sentence and reports it as the token.
      for (const m of text.matchAll(/(\{\{[^}]*\}\}|\d+)\s+(?:selectable tracks|canonical shapes) ship in the pristine template/g)) {
        claims.push({ rel, token: m[1].trim() });
      }
    }
    assert.ok(claims.length > 0, 'at least one page must make a shipped-count claim');
    for (const c of claims) {
      const literal = Number(c.token);
      if (!Number.isNaN(literal)) {
        assert.equal(literal, templateCount, `${c.rel} claims ${literal}; template ships ${templateCount}`);
      } else {
        // The accessor must NAME the shipped count. `tracks.canonical` is
        // ambiguous — it was the one wired to the live tree — so a shipped
        // claim must read from an explicitly-shipped accessor instead.
        assert.match(
          c.token,
          /\b(shipped|template)\b/i,
          `${c.rel} interpolates "${c.token}" — a shipped claim must read an explicitly shipped-named accessor (e.g. tracks.shipped), not the ambiguous tracks.canonical`,
        );
      }
    }
  });

  it('test_when_site_claim_matches_live_only_then_audit_fails', () => { // AC-006
    // Drives the real checker rather than re-deriving arithmetic: a synthetic
    // page claiming a divergent count must be REPORTED, and a truthful one must
    // not. Without both halves this passes vacuously.
    const checkShippedClaims = fn('checkShippedClaims');
    const templateCount = selectableIn(TEMPLATE_JSONL);
    const divergent = templateCount + 1;

    const bad = checkShippedClaims({
      templateCount,
      pages: [{ path: 'workflows/index.html', text: `${divergent} selectable tracks ship in the pristine template` }],
    });
    assert.equal(bad.ok, false, 'a divergent shipped-count claim must be reported as a failure');
    assert.match(
      JSON.stringify(bad.offenders || []),
      /workflows\/index\.html/,
      'the failure must name the offending page',
    );

    const good = checkShippedClaims({
      templateCount,
      pages: [{ path: 'workflows/index.html', text: `${templateCount} selectable tracks ship in the pristine template` }],
    });
    assert.equal(good.ok, true, 'a truthful shipped-count claim must pass');
  });

  it('test_when_seed_prose_scanned_then_all_track_counts_agree', () => { // AC-007
    const templateCount = selectableIn(TEMPLATE_JSONL);
    const seed = readFileSync(path.join(REPO_ROOT, 'docs/init/seed.md'), 'utf8');
    const stated = [...seed.matchAll(/(\d+)\s+selectable/g)].map((m) => ({
      n: Number(m[1]),
      line: seed.slice(0, m.index).split('\n').length,
    }));
    assert.ok(stated.length > 0, 'seed.md must state a selectable-track count');
    const wrong = stated.filter((s) => s.n !== templateCount);
    assert.deepEqual(
      wrong,
      [],
      `every seed.md selectable-count assertion must equal the template count (${templateCount}); disagreeing lines: ${JSON.stringify(wrong)}`,
    );
  });
});
