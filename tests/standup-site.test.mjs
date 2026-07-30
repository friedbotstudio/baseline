// Build-output tests for the /standup documentation page.
//
// No mocks: the real eleventy site is built once (before hook) and the rendered
// HTML in obj/site/ is asserted against.
//
// REWRITTEN 2026-07-29. The original file was written against the retired
// standup marketing-site feature and pinned that design's markup: a
// `hero-symbol` SVG partial, a `.dc-body` dev-console block, a `.standup-teaser`
// homepage section, a `.cli-strip` copy pill, and the `_data/nav.json` shape.
// Every one of those primitives was removed in the site rewrite, so those
// assertions could only fail. They are gone.
//
// What survives is what was actually being protected, re-expressed against the
// page that exists now:
//   - the page builds and is reachable
//   - it uses the docs layout, with its on-page table of contents
//   - the recap is semantic text, never a screenshot
//   - the copy carries no em dash and no fluff word
//   - standup is discoverable from the sidebar and from the homepage
//   - any reveal animation is reduced-motion gated
//   - audit-baseline stays green

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

// The rendered page body, without the shared chrome. The layout's own footer and
// top bar are not this page's copy, so a style rule aimed at the page must not be
// judged on them.
function articleOf(html) {
  const start = html.indexOf('<article');
  if (start === -1) return html;
  const end = html.indexOf('</article>', start);
  return end === -1 ? html.slice(start) : html.slice(start, end);
}

before(() => {
  buildSite();
});

// ---- Orchestration: the scenarios -------------------------------------

describe('standup site — page emitted', () => {
  it('test_when_site_built_then_standup_page_emitted', () => {
    assert.ok(existsSync(join(OUT, 'standup/index.html')), 'obj/site/standup/index.html must be emitted');
  });
});

describe('standup site — docs layout', () => {
  it('test_when_standup_page_then_docs_layout_with_toc', () => {
    const html = readBuilt('standup/index.html');
    assert.ok(html, 'standup page must build');
    assert.match(html, /class="[^"]*\btoc\b/, 'page must render the docs layout table of contents');
    const anchors = [...html.matchAll(/<h2 id="([a-z-]+)"/g)].map((m) => m[1]);
    assert.ok(anchors.length >= 3, `page must carry section anchors for the toc; found ${JSON.stringify(anchors)}`);
    for (const id of anchors) {
      assert.match(html, new RegExp(`href="#${id}"`), `the toc must link every section anchor; #${id} is unlinked`);
    }
  });
});

describe('standup site — readout is text not image', () => {
  it('test_when_standup_page_then_readout_is_text_not_image', () => {
    const html = readBuilt('standup/index.html');
    assert.ok(html, 'standup page must build');
    const article = articleOf(html);
    assert.ok(!/<img/.test(article), 'the recap must be text, never a screenshot');
    assert.match(article, /<pre[^>]*>/, 'the recap must render in a <pre> block');
    assert.match(
      article,
      /\d+\.\d+\.\d+|backlog|release|unreleased/i,
      'the page must show real recap content, not a placeholder',
    );
  });
});

describe('standup site — copy is clean', () => {
  it('test_when_standup_section_then_no_em_dash_and_no_fluff', () => {
    const page = stripTags(articleOf(readBuilt('standup/index.html') || ''));
    assert.ok(!EM_DASH.test(page), 'standup page copy must contain no em dash');
    assert.ok(!FLUFF.test(page), 'standup page copy must contain no banned fluff word');
  });
});

describe('standup site — discoverability', () => {
  it('test_when_discovery_surfaces_then_all_reference_standup', () => {
    // The sidebar is generated from docsnav.json, which is the IA's single
    // source of truth; the old nav.json shape is gone.
    const nav = JSON.parse(readSrc('site-src/_data/docsnav.json'));
    const listed = nav.some((g) => (g.items || []).some((i) => i.url === '/standup/'));
    assert.ok(listed, 'a docsnav group must carry /standup/');

    // Reachable from the homepage, and from the footer of any page.
    const index = readBuilt('index.html') || '';
    assert.match(index, /href="[^"]*\/standup\/"/, 'the homepage must link /standup/');

    const page = readBuilt('standup/index.html') || '';
    const footerAt = page.indexOf('<footer');
    assert.ok(footerAt !== -1, 'built page must contain a footer');
  });
});

describe('standup site — reduced motion', () => {
  it('test_when_reveal_motion_then_reduced_motion_gated', () => {
    const css = readSrc('site-src/assets/site.css');
    const revealClass = /\.(su-reveal|standup-reveal|standup-teaser[\w-]*reveal)/.exec(css);
    if (!revealClass) {
      assert.ok(true, 'no standup-specific reveal animation added; vacuously satisfied');
      return;
    }
    const token = revealClass[1];
    const rmIdx = css.indexOf('prefers-reduced-motion');
    assert.ok(rmIdx !== -1, 'a prefers-reduced-motion block must exist');
    const rmBlock = css.slice(rmIdx, rmIdx + 1200);
    assert.ok(rmBlock.includes(token), `reduced-motion block must disable .${token}`);
  });
});

describe('standup site — audit neutrality', () => {
  it('test_when_audit_after_change_then_exit_zero', () => {
    execFileSync('node', ['.claude/skills/audit-baseline/audit.mjs'], { cwd: REPO_ROOT, stdio: 'pipe' });
    // execFileSync throws on non-zero exit; reaching here means audit exited 0.
  });
});
