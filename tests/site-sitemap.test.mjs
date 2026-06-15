// Smoke test for the generated sitemap: build the site, then assert obj/site/sitemap.xml
// is well-formed, lists the public pages with ABSOLUTE <loc> URLs rooted at the
// CNAME origin, and excludes itself.
//
// RED until site-src/sitemap.njk exists and site-src/_data/site.cjs exposes `url`.
// Build is slow (~eleventy); skip it (when obj/site is fresh) with SITE_SITEMAP_SKIP_BUILD=1.
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITEMAP = path.join(REPO_ROOT, 'obj/site/sitemap.xml');
const CNAME = path.join(REPO_ROOT, 'site-src/CNAME');
const skipBuild = process.env.SITE_SITEMAP_SKIP_BUILD === '1';

const expectedOrigin = () => `https://${readFileSync(CNAME, 'utf8').trim()}`;
const locs = (xml) => [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim());

describe('site sitemap — generated, absolute, self-excluding', () => {
  let xml = '';

  before(() => {
    if (!skipBuild) {
      const r = spawnSync('npm', ['run', 'build:site'], { cwd: REPO_ROOT, encoding: 'utf8', timeout: 120_000 });
      assert.equal(r.status, 0, `build:site failed: ${r.stderr || r.stdout}`);
    }
    if (existsSync(SITEMAP)) xml = readFileSync(SITEMAP, 'utf8');
  });

  it('test_when_site_built_then_sitemap_xml_exists_and_is_wellformed', () => {
    assert.ok(existsSync(SITEMAP), 'obj/site/sitemap.xml must exist after build');
    assert.match(xml, /<\?xml\s+version=/, 'must have an XML declaration');
    assert.match(xml, /<urlset[\s>]/, 'must have a <urlset> root');
    assert.match(xml, /<\/urlset>/, 'must close </urlset>');
    assert.ok(locs(xml).length >= 2, 'must list at least 2 URLs');
  });

  it('test_when_sitemap_read_then_locs_are_absolute_from_cname_origin', () => {
    const origin = expectedOrigin();
    const all = locs(xml);
    assert.ok(all.length > 0, 'sitemap has <loc> entries');
    for (const loc of all) {
      assert.ok(loc.startsWith(`${origin}/`), `every <loc> must be absolute under ${origin}: got ${loc}`);
    }
    assert.ok(all.includes(`${origin}/`), `homepage ${origin}/ must be listed`);
  });

  it('test_when_sitemap_read_then_lists_public_pages_and_excludes_itself', () => {
    const all = locs(xml);
    assert.ok(new Set(all).size > 2, 'must list several distinct pages');
    assert.ok(!all.some((loc) => loc.endsWith('/sitemap.xml')), 'sitemap must not list itself');
    assert.ok(
      all.some((loc) => /(hooks|cli|memory|workflows|swarm|install)/.test(loc)),
      'must list at least one known content page',
    );
  });
});
