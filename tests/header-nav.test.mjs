// The global header must describe the whole documentation site.
//
// Two earlier shapes were wrong in opposite directions. It first carried homepage
// fragments (#install, #governance), so a reader on a docs page who clicked one was
// thrown back to the landing page. It then carried six hand-picked page links, which
// duplicated six of the sidebar's seventeen entries and left the other eleven with no
// route from the header at all.
//
// It now carries one link per docsnav group, derived. The assertion that matters is
// COVERAGE: every built page must sit under a group the header links, so the header
// describes the site rather than sampling it. Unit coverage for the pure function
// lives in tests/docs-pager.test.mjs; this file asserts the rendered result.

import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensureSiteBuilt, readRendered } from './helpers/site-build.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(REPO_ROOT, 'obj/site');

const docsnav = JSON.parse(
  readFileSync(path.join(REPO_ROOT, 'site-src/_data/docsnav.json'), 'utf8'),
);

// "/hooks/" -> obj/site/hooks/index.html
const builtPathFor = (url) => path.join(OUT, url.replace(/^\/|\/$/g, ''), 'index.html');

function headerNav(rel) {
  const html = readRendered(rel);
  const block = /<nav class="util-nav"[\s\S]*?<\/nav>/.exec(html);
  assert.ok(block, `${rel} must render the primary nav`);
  return block[0];
}

const linksIn = (navBlock) =>
  [...navBlock.matchAll(/<a[^>]*href="([^"]*)"[^>]*>([^<]+)<\/a>/g)].map((m) => ({
    href: m[1],
    label: m[2].trim(),
  }));

const currentIn = (navBlock) =>
  [...navBlock.matchAll(/aria-current="page"[^>]*>([^<]+)</g)].map((m) => m[1].trim());

describe('header nav — derived from the documentation groups', () => {
  before(() => {
    ensureSiteBuilt();
  });

  it('test_when_header_rendered_then_one_link_per_group_with_a_built_page', () => {
    const expected = docsnav.filter((g) => (g.items || []).some((i) => i.url)).length;
    const links = linksIn(headerNav('index.html'));
    assert.equal(
      links.length,
      expected,
      `expected ${expected} header links, one per group carrying a built page; got ${links.length}`,
    );
  });

  it('test_when_header_rendered_then_no_link_is_a_homepage_fragment', () => {
    const anchors = linksIn(headerNav('hooks/index.html')).filter((l) => l.href.includes('#'));
    assert.deepEqual(
      anchors,
      [],
      `no primary link may be a fragment; got ${JSON.stringify(anchors)}`,
    );
  });

  it('test_when_header_rendered_then_every_link_resolves_to_a_built_page', () => {
    const broken = linksIn(headerNav('index.html'))
      .map((l) => l.href)
      .filter((href) => !existsSync(builtPathFor(href.replace(/^\.\//, '/'))));
    assert.deepEqual(broken, [], `every header link must resolve to a built page; broken: ${JSON.stringify(broken)}`);
  });

  it('test_when_header_rendered_then_every_built_page_is_under_a_linked_group', () => {
    // The rule this whole design exists to satisfy: a global nav should
    // collectively describe every page in the documentation site.
    const labels = new Set(linksIn(headerNav('index.html')).map((l) => l.label));
    const uncovered = [];
    for (const group of docsnav) {
      const built = (group.items || []).filter((i) => i.url);
      if (built.length === 0) continue;
      const label = group.group || built[0].label;
      if (!labels.has(label)) uncovered.push(...built.map((i) => i.url));
    }
    assert.deepEqual(
      uncovered,
      [],
      `these pages sit under no header group, so the header cannot reach them: ${JSON.stringify(uncovered)}`,
    );
  });

  it('test_when_page_is_not_its_group_entry_point_then_its_group_is_still_current', () => {
    // /roadmap/ is the fourth page of How-to guides, not the one the header links.
    // Under the previous page-matching header this marked nothing at all.
    const current = currentIn(headerNav('roadmap/index.html'));
    assert.deepEqual(current, ['How-to guides'], `expected the group to be current; got ${JSON.stringify(current)}`);
  });

  it('test_when_docs_page_rendered_then_exactly_one_group_is_current', () => {
    for (const rel of ['hooks/index.html', 'memory/index.html', 'install/index.html']) {
      assert.equal(currentIn(headerNav(rel)).length, 1, `${rel} must mark exactly one group current`);
    }
  });

  it('test_when_homepage_rendered_then_no_group_is_current', () => {
    assert.deepEqual(
      currentIn(headerNav('index.html')),
      [],
      'the marketing homepage belongs to no docs group, so none may claim to be current',
    );
  });

  it('test_when_header_compared_across_surfaces_then_it_is_identical', () => {
    // A global nav that changes shape between the landing page and the docs stops
    // being a fixed reference point.
    const home = linksIn(headerNav('index.html')).map((l) => l.label);
    const docs = linksIn(headerNav('cli/index.html')).map((l) => l.label);
    assert.deepEqual(docs, home, 'the header must carry the same links on every surface');
  });
});
