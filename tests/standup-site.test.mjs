// Build-output tests for the standup marketing-site feature.
//
// No mocks: the real eleventy site is built once (before hook) and the rendered
// HTML in obj/site/ is asserted against. Foundation helpers do the build + reads;
// the test cases (orchestration) only assert.
//
// Spec traceability (docs/specs/standup-site-feature.md):
//   AC-001 — build emits a reachable /standup page
//   AC-002 — /standup uses the docs.njk layout (toc, eyebrow, lead)
//   AC-003 — the standup hero-symbol partial renders
//   AC-004 — readout is semantic text in a figure, not an <img>
//   AC-005 — homepage teaser before Adoption, links /standup/ with data-cta
//   AC-006 — nav + footer + skills catalog reference standup
//   AC-007 — copy has no em dash and no banned fluff word
//   AC-008 — any reveal animation is reduced-motion gated
//   AC-009 — readout content is a real captured /standup readout
//   AC-010 — CTA is a click-to-copy /standup pill (.cli-strip/data-copy)
//   AC-011 — audit-baseline stays green (skill count unchanged)
//
// Implementation contract the tests depend on:
//   - the readout is a `.dc-body` <pre> inside the standup page (text, not <img>)
//   - the homepage teaser section carries class "standup-teaser"
//   - the /standup copy pill uses class "cli-strip" + data-copy="/standup"

import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// ---- Foundation: paths, build, readers --------------------------------

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(REPO_ROOT, 'obj/site');
const FLUFF = /\b(seamless|powerful|revolutionary|effortless)\b/i;
const EM_DASH = /—|&mdash;|&#8212;|&#x2014;/i;

function buildSite() {
  execFileSync('npm', ['run', 'build:site'], { cwd: REPO_ROOT, stdio: 'pipe' });
}

function readBuilt(rel) {
  const p = join(OUT, rel);
  return existsSync(p) ? readFileSync(p, 'utf8') : null;
}

function readSrc(rel) {
  return readFileSync(join(REPO_ROOT, rel), 'utf8');
}

function stripTags(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ');
}

function regionAround(html, needle, span = 800) {
  const i = html.indexOf(needle);
  if (i === -1) return '';
  return html.slice(Math.max(0, i - span), i + span);
}

before(() => {
  buildSite();
});

// ---- Orchestration: the scenarios -------------------------------------

describe('standup site — page emitted', () => {
  it('test_when_site_built_then_standup_page_emitted', () => {
    // AC-001
    assert.ok(existsSync(join(OUT, 'standup/index.html')), 'obj/site/standup/index.html must be emitted');
  });
});

describe('standup site — docs layout', () => {
  it('test_when_standup_page_then_docs_layout_with_toc', () => {
    // AC-002
    const html = readBuilt('standup/index.html');
    assert.ok(html, 'standup page must build');
    assert.match(html, /class="eyebrow"/, 'page must render the docs.njk eyebrow');
    assert.ok(html.includes('href="#readout"') || html.includes('id="readout"'), 'page must carry its toc / section anchors');
  });

  it('test_when_standup_then_hero_symbol_renders', () => {
    // AC-003
    const html = readBuilt('standup/index.html') || '';
    assert.match(html, /standup-title/, 'the standup hero-symbol partial must render (its SVG <title id="standup-title">)');
  });
});

describe('standup site — readout is text not image', () => {
  it('test_when_standup_page_then_readout_is_text_not_image', () => {
    // AC-004, AC-009
    const html = readBuilt('standup/index.html');
    assert.ok(html, 'standup page must build');
    assert.ok(html.includes('dc-body'), 'readout must use the .dc-body dev-console block');
    const region = regionAround(html, 'dc-body', 1200);
    assert.ok(!region.includes('<img'), 'readout region must not use an <img> (text, not image)');
    assert.match(region, /\d+\.\d+\.\d+|backlog|release|unreleased/i, 'readout must carry real recap text');
  });
});

describe('standup site — copy is clean', () => {
  it('test_when_standup_section_then_no_em_dash_and_no_fluff', () => {
    // AC-007
    const page = stripTags(readBuilt('standup/index.html') || '');
    assert.ok(!EM_DASH.test(page), 'standup page copy must contain no em dash');
    assert.ok(!FLUFF.test(page), 'standup page copy must contain no banned fluff word');

    const index = readBuilt('index.html') || '';
    const teaser = stripTags(regionAround(index, 'standup-teaser', 1500));
    assert.ok(teaser.length > 0, 'homepage teaser (class standup-teaser) must exist');
    assert.ok(!EM_DASH.test(teaser), 'teaser copy must contain no em dash');
    assert.ok(!FLUFF.test(teaser), 'teaser copy must contain no banned fluff word');
  });
});

describe('standup site — homepage teaser', () => {
  it('test_when_homepage_then_teaser_before_install_links_standup', () => {
    // AC-005
    const index = readBuilt('index.html');
    assert.ok(index, 'index must build');
    const installAt = index.indexOf('id="install"');
    assert.ok(installAt !== -1, 'Adoption section (id=install) must exist');
    const before = index.slice(0, installAt);
    assert.ok(before.includes('/standup/'), 'a link to /standup/ must appear before the Adoption section');
    const teaser = regionAround(index, 'standup-teaser', 1500);
    assert.match(teaser, /data-cta/, 'teaser CTA must carry a data-cta attribute');
  });
});

describe('standup site — discoverability', () => {
  it('test_when_discovery_surfaces_then_all_reference_standup', () => {
    // AC-006
    const nav = JSON.parse(readSrc('site-src/_data/nav.json'));
    assert.ok(nav.primary.some((i) => i.href === '/standup/'), 'topnav must include /standup/');
    assert.ok(
      nav.sidebar.some((g) => Array.isArray(g.items) && g.items.some((i) => i.href === '/standup/')),
      'a sidebar group must include /standup/',
    );
    assert.match(readSrc('site-src/_includes/footer.njk'), /\/standup\//, 'footer must link /standup/');
    assert.match(readSrc('site-src/skills/core.njk'), /standup/, 'skills catalog must name standup');
  });
});

describe('standup site — reduced motion', () => {
  it('test_when_reveal_motion_then_reduced_motion_gated', () => {
    // AC-008
    const css = readSrc('site-src/assets/site.css');
    const revealClass = /\.(su-reveal|standup-reveal|standup-teaser[\w-]*reveal)/.exec(css);
    if (!revealClass) {
      assert.ok(true, 'no standup-specific reveal animation added; AC-008 vacuously satisfied');
      return;
    }
    const token = revealClass[1];
    const rmIdx = css.indexOf('prefers-reduced-motion');
    assert.ok(rmIdx !== -1, 'a prefers-reduced-motion block must exist');
    const rmBlock = css.slice(rmIdx, rmIdx + 1200);
    assert.ok(rmBlock.includes(token), `reduced-motion block must disable .${token}`);
  });
});

describe('standup site — copy pill', () => {
  it('test_when_standup_then_cli_strip_copy_pill', () => {
    // AC-010
    const html = readBuilt('standup/index.html') || '';
    assert.ok(html.includes('cli-strip'), 'standup page must use the .cli-strip pill');
    assert.match(html, /data-copy="\/standup"/, 'copy pill must carry data-copy="/standup"');
  });
});

describe('standup site — audit neutrality', () => {
  it('test_when_audit_after_change_then_exit_zero', () => {
    // AC-011
    execFileSync('node', ['.claude/skills/audit-baseline/audit.mjs'], { cwd: REPO_ROOT, stdio: 'pipe' });
    // execFileSync throws on non-zero exit; reaching here means audit exited 0.
  });
});
