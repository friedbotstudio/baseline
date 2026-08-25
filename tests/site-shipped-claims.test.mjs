// T2/T5 — no rendered page may assert a LIVE-tree count as a SHIPPED count.
// This is the site-facing half of the count-truth defect: derive-counts read the
// dev tree, so the site rendered 9 and claimed those 9 "ship in the pristine
// template" while the template shipped 8.

import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import {
  ensureSiteBuilt, readRendered, renderedPages, REPO_ROOT,
} from './helpers/site-build.mjs';

const selectableIn = (file) =>
  existsSync(file)
    ? readFileSync(file, 'utf8').split('\n').filter((l) => l.trim())
        .map((l) => JSON.parse(l)).filter((t) => t.selectable === true).length
    : null;

let templateCount = null;
let liveCount = null;
let pages = [];

// "N selectable tracks ship in the pristine template" / "N canonical shapes ship in ..."
const SHIPPED_CLAIM = /(\d+)\s+(?:selectable tracks|canonical shapes|canonical tracks)\s+ship in the pristine template/gi;

describe('T2 — shipped-count claims resolve from the shipped template', () => {
  before(() => {
    ensureSiteBuilt();
    templateCount = selectableIn(path.join(REPO_ROOT, 'obj/template/.claude/workflows.jsonl'));
    liveCount = selectableIn(path.join(REPO_ROOT, '.claude/workflows.jsonl'));
    pages = renderedPages();
  });

  it('test_when_pages_scanned_then_no_live_count_claimed_as_shipped', () => { // AC-014
    assert.ok(templateCount !== null, 'the shipped template must exist to compare against');
    const offenders = [];
    for (const rel of pages) {
      const html = readRendered(rel);
      for (const m of html.matchAll(SHIPPED_CLAIM)) {
        const claimed = Number(m[1]);
        if (claimed !== templateCount) offenders.push({ rel, claimed, templateCount });
      }
    }
    assert.deepEqual(
      offenders,
      [],
      `no page may claim a count the template does not ship; offenders: ${JSON.stringify(offenders)}`,
    );
  });

  it('test_when_live_and_template_diverge_then_claim_tracks_the_template', () => { // AC-014
    // The regression this defends: when the two trees agree the bug is
    // invisible, so assert the claim follows the TEMPLATE specifically.
    if (liveCount === templateCount) {
      assert.ok(true, 'trees agree; the divergence assertion is exercised by track-count-truth');
      return;
    }
    const claims = [];
    for (const rel of pages) {
      for (const m of readRendered(rel).matchAll(SHIPPED_CLAIM)) claims.push(Number(m[1]));
    }
    for (const c of claims) {
      assert.notEqual(c, liveCount, 'a shipped claim must never equal the live-only count');
      assert.equal(c, templateCount, 'a shipped claim must equal the template count');
    }
  });

  it('test_when_org_claimed_shipped_then_org_is_in_the_template', () => { // AC-014
    const templateFile = path.join(REPO_ROOT, 'obj/template/.claude/workflows.jsonl');
    const hasOrg = readFileSync(templateFile, 'utf8')
      .split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l))
      .some((t) => t.track_id === 'org' && t.selectable === true);
    const siteMentionsOrgAsShipped = pages.some((rel) => {
      const html = readRendered(rel);
      return /org/i.test(html) && SHIPPED_CLAIM.test(html);
    });
    if (siteMentionsOrgAsShipped) {
      assert.ok(hasOrg, 'if a page lists org among shipped tracks, org must be in the shipped template');
    } else {
      assert.ok(true, 'no page claims org as shipped');
    }
  });
});

// The velocity page quotes this repository's own fitted envelope — a sample count
// and a token figure, both hand-copied from a live measurement. Measured
// 2026-08-25: the page said 25 samples and 37,348 tokens while the fitter read 28
// and 39,536, and the sample terminal block beneath it still carried the older
// pair, so the page disagreed with itself as well as with the corpus.
//
// A number nobody re-derives goes stale the moment the corpus grows. This asserts
// the page against `envelopeFor` rather than against a second hand-copied literal,
// so the only way to satisfy it is to read the real value.
describe('site — a quoted envelope measurement matches the fitter', () => {
  it('test_when_the_velocity_page_quotes_an_envelope_then_it_equals_envelopeFor', async () => {
    const source = readFileSync(path.join(REPO_ROOT, 'site-src/velocity.njk'), 'utf8');
    const mod = await import('../.claude/skills/harness/envelope.mjs');
    const fitted = mod.envelopeFor({ rootDir: REPO_ROOT, track: 'tdd-quickfix' });

    // Only assert while the fit is real. An unfitted repo quotes a shipped default,
    // and pinning the page to that would be pinning it to a placeholder.
    if (!fitted?.fitted) {
      assert.ok(true, 'envelope is unfitted here; nothing measured to hold the page to');
      return;
    }

    const grouped = (n) => Number(n).toLocaleString('en-US');
    const stale = [];
    for (const quoted of source.matchAll(/([\d,]{4,})\s*<\/span>\s*tokens\s*<span[^>]*>\(fitted, (\d+) samples\)/g)) {
      if (quoted[1] !== grouped(fitted.envelope_tokens)) {
        stale.push(`sample block says ${quoted[1]} tokens, fitter says ${grouped(fitted.envelope_tokens)}`);
      }
      if (Number(quoted[2]) !== fitted.sample_count) {
        stale.push(`sample block says ${quoted[2]} samples, fitter says ${fitted.sample_count}`);
      }
    }
    for (const quoted of source.matchAll(/has (\d+) archived <code[^>]*>tdd-quickfix<\/code> runs[^.]*\.\s*They put the envelope for that track at ([\d,]+) tokens/g)) {
      if (Number(quoted[1]) !== fitted.sample_count) {
        stale.push(`prose says ${quoted[1]} runs, fitter says ${fitted.sample_count}`);
      }
      if (quoted[2] !== grouped(fitted.envelope_tokens)) {
        stale.push(`prose says ${quoted[2]} tokens, fitter says ${grouped(fitted.envelope_tokens)}`);
      }
    }

    assert.deepEqual(
      stale,
      [],
      'the velocity page quotes this repo\'s own envelope fit; re-read it from `envelopeFor` rather than leaving a number the corpus has already moved past',
    );
  });
});
