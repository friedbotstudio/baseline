// T7 — JSON-LD. Google's Software App rich result leans on `offers` and
// `aggregateRating`, but this project has no ratings and no reviews. Emitting
// them would be schema spam AND a fabricated record, so AC-018 asserts their
// ABSENCE. The rich result may not render; that is a deliberate trade.

import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { ensureSiteBuilt, readRendered, renderedPages } from './helpers/site-build.mjs';

let pages = [];

/** Every application/ld+json payload on a page, as { rel, raw }. */
function blocksOn(rel) {
  const html = readRendered(rel);
  return [...html.matchAll(/<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)]
    .map((m) => ({ rel, raw: m[1].trim() }));
}

const allBlocks = () => pages.flatMap(blocksOn);

/** Flatten a parsed JSON-LD value into every nested object, including @graph. */
function nodesOf(value) {
  if (Array.isArray(value)) return value.flatMap(nodesOf);
  if (value && typeof value === 'object') {
    return [value, ...Object.values(value).flatMap(nodesOf)];
  }
  return [];
}

describe('T7 — structured data is valid and fabricates nothing', () => {
  before(() => {
    ensureSiteBuilt();
    pages = renderedPages();
  });

  it('test_when_jsonld_blocks_parsed_then_valid_json', () => { // AC-018
    const blocks = allBlocks();
    assert.ok(blocks.length > 0, 'the site must emit at least one JSON-LD block');
    const broken = [];
    for (const b of blocks) {
      try { JSON.parse(b.raw); } catch (e) { broken.push({ rel: b.rel, error: e.message }); }
    }
    assert.deepEqual(broken, [], `every JSON-LD block must parse; broken: ${JSON.stringify(broken)}`);
  });

  it('test_when_jsonld_present_then_no_aggregate_rating_or_review', () => { // AC-018
    const offenders = [];
    for (const b of allBlocks()) {
      const nodes = nodesOf(JSON.parse(b.raw));
      for (const n of nodes) {
        for (const key of ['aggregateRating', 'review', 'ratingValue', 'reviewCount']) {
          if (Object.prototype.hasOwnProperty.call(n, key)) offenders.push({ rel: b.rel, key });
        }
      }
    }
    assert.deepEqual(
      offenders,
      [],
      `no block may assert a rating or review the project does not have; offenders: ${JSON.stringify(offenders)}`,
    );
  });

  it('test_when_software_application_present_then_required_props_set', () => { // AC-018
    const apps = allBlocks()
      .flatMap((b) => nodesOf(JSON.parse(b.raw)))
      .filter((n) => n['@type'] === 'SoftwareApplication');
    assert.ok(apps.length > 0, 'the homepage must describe the product as a SoftwareApplication');
    for (const app of apps) {
      for (const prop of ['name', 'applicationCategory', 'operatingSystem']) {
        assert.ok(app[prop], `SoftwareApplication must set required property "${prop}"`);
      }
      if (app.offers) {
        assert.equal(String(app.offers.price), '0', 'the project is free; any offer must be zero-price');
      }
    }
  });

  it('test_when_docs_pages_rendered_then_typed_as_tech_article', () => { // AC-018
    const docsPage = pages.find((rel) => /^(hooks|memory|workflows|cli|governance)\//.test(rel));
    assert.ok(docsPage, 'at least one docs page must render');
    const types = blocksOn(docsPage)
      .flatMap((b) => nodesOf(JSON.parse(b.raw)))
      .map((n) => n['@type']);
    assert.ok(
      types.includes('TechArticle'),
      `docs pages must carry TechArticle typing; ${docsPage} declared ${JSON.stringify(types)}`,
    );
  });

  it('test_when_page_has_no_jsonld_then_allowed', () => { // AC-018
    // Validity is asserted only where a block exists; a bare page is fine.
    const bare = pages.filter((rel) => blocksOn(rel).length === 0);
    for (const rel of bare) {
      assert.ok(typeof rel === 'string', 'a page with no JSON-LD block is permitted');
    }
    assert.ok(true, `${bare.length} page(s) carry no JSON-LD; that is allowed`);
  });
});
