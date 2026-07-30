// T5 — half the site is currently unreachable from the homepage: 9 of 18 pages
// have zero topnav and zero footer presence, so they exist only behind a docs
// sidebar you must already be inside to see.
//
// RED until nav.json + footer are restructured.

import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  ensureSiteBuilt, readRendered, renderedPages, urlPathFor, hrefsIn, REPO_ROOT,
} from './helpers/site-build.mjs';

let pages = [];
let reachable = new Set();

// Breadth-first from '/', two hops. Hop 1 = linked from the homepage; hop 2 =
// linked from anything hop 1 reached.
function walkFromRoot(maxHops = 2) {
  const byUrl = new Map(pages.map((rel) => [urlPathFor(rel), rel]));
  const seen = new Set(['/']);
  let frontier = ['/'];
  for (let hop = 0; hop < maxHops; hop += 1) {
    const next = [];
    for (const url of frontier) {
      const rel = byUrl.get(url);
      if (!rel) continue;
      for (const href of hrefsIn(readRendered(rel), rel)) {
        const norm = href.endsWith('/') || href.includes('.') ? href : `${href}/`;
        if (byUrl.has(norm) && !seen.has(norm)) {
          seen.add(norm);
          next.push(norm);
        }
      }
    }
    frontier = next;
  }
  return seen;
}

describe('T5 — every page is reachable from the homepage', () => {
  before(() => {
    ensureSiteBuilt();
    pages = renderedPages().filter((rel) => !rel.endsWith('404.html'));
    reachable = walkFromRoot(2);
  });

  it('test_when_links_walked_from_root_then_every_page_within_two_hops', () => { // AC-013
    const orphans = pages
      .map(urlPathFor)
      .filter((url) => !reachable.has(url));
    assert.deepEqual(
      orphans,
      [],
      `every rendered page must be reachable from / within two hops; orphaned: ${JSON.stringify(orphans)}`,
    );
  });

  it('test_when_topnav_rendered_then_parallel_work_surfaced', () => { // AC-013
    // The header no longer enumerates pages, so "does it name swarm?" is the wrong
    // question. It carries one link per docs group, and the parallel-work pages
    // (Swarm mode, Org mode) live in one of them. The contract that survives is
    // REACHABILITY: a header group must lead to them, and the homepage must say
    // they exist. _data/topnav.json is gone; docsnav.json is the source now.
    const docsnav = JSON.parse(
      readFileSync(path.join(REPO_ROOT, 'site-src/_data/docsnav.json'), 'utf8'),
    );
    // Match the PAGES, not any url containing "org" — /org/setup/ is the Org
    // tutorial and lives in Getting started, which would silently pass this test
    // while proving nothing about the concept pages.
    const PARALLEL = ['/swarm/', '/org/'];
    const home = readRendered('index.html');
    const navBlock = /<nav class="util-nav"[\s\S]*?<\/nav>/.exec(home);
    assert.ok(navBlock, 'the homepage must render the primary nav');

    for (const url of PARALLEL) {
      const owning = docsnav.find((g) => (g.items || []).some((i) => i.url === url));
      assert.ok(owning, `${url} must sit in a docs group`);
      const entry = (owning.items || []).find((i) => i.url);
      assert.match(
        navBlock[0],
        new RegExp(`href="[^"]*${entry.url.replace(/\//g, '\\/')}"`),
        `the header must link the group that holds ${url} (its entry page is ${entry.url})`,
      );
    }

    assert.ok(
      /(parallel|org mode|swarm)/i.test(home),
      'the rendered homepage must mention the parallel-work surface',
    );
  });

  it('test_when_404_rendered_then_recovery_cards_cover_every_route', () => { // AC-013
    const notFound = readRendered('404.html');
    assert.ok(notFound, '404.html must render');
    // `pm-mode`, not `pm`: the page shipped under the route that matches its nav
    // label ("PM mode"). The assertion is route coverage, so the slug tracks the
    // route that exists.
    const missing = ['swarm', 'org', 'pm-mode', 'mcp', 'velocity', 'epics', 'cli']
      .filter((slug) => !new RegExp(`href="[^"]*/${slug}/?"`).test(notFound));
    assert.deepEqual(
      missing,
      [],
      `404 recovery cards must cover every route; missing: ${JSON.stringify(missing)}`,
    );
  });

  it('test_when_sitemap_rendered_then_excludes_404', () => { // regression
    const xml = readRendered('sitemap.xml');
    assert.ok(xml.length > 0, 'sitemap.xml must still render after the IA change');
    assert.ok(!/404/.test(xml), 'sitemap must continue to exclude the 404 page');
  });
});
