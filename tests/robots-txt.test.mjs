// T7 — robots.txt. Crawler tokens are pinned from VENDOR docs, not SEO blogs:
// several widely-cited 2026 posts still recommend `anthropic-ai` and
// `Claude-Web`, neither of which is on Anthropic's current list, so directives
// built from them would match nothing.
//
// Policy (D-5): allow every named bot explicitly. The project is Apache 2.0 and
// its own principle is that every claim points at a file you can open; blocking
// training crawlers would contradict the licence and reduce citation reach.

import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { ensureSiteBuilt, readRendered, siteOrigin } from './helpers/site-build.mjs';

let robots = '';

// Pinned 2026-07 from vendor documentation.
const TRAINING = ['GPTBot', 'ClaudeBot', 'Google-Extended'];
const SEARCH = ['OAI-SearchBot', 'Claude-SearchBot', 'PerplexityBot', 'Googlebot'];
const USER_INITIATED = ['ChatGPT-User', 'Claude-User', 'Perplexity-User'];
const ALL_TOKENS = [...TRAINING, ...SEARCH, ...USER_INITIATED];

// Tokens that appear in stale secondary coverage but are not current.
const DEPRECATED = ['anthropic-ai', 'Claude-Web'];

/** Parse robots.txt into [{ agent, directives: [[key, value], ...] }]. */
function groups(text) {
  const out = [];
  let current = null;
  for (const raw of text.split('\n')) {
    const line = raw.replace(/#.*$/, '').trim();
    if (!line) continue;
    const [key, ...rest] = line.split(':');
    const value = rest.join(':').trim();
    if (/^user-agent$/i.test(key)) {
      current = { agent: value, directives: [] };
      out.push(current);
    } else if (current) {
      current.directives.push([key.trim().toLowerCase(), value]);
    }
  }
  return out;
}

const groupFor = (agent) =>
  groups(robots).find((g) => g.agent.toLowerCase() === agent.toLowerCase());

describe('T7 — robots.txt allows every current crawler explicitly', () => {
  before(() => {
    ensureSiteBuilt();
    robots = readRendered('robots.txt');
  });

  it('test_when_site_built_then_robots_names_every_crawler_token_with_allow', () => { // AC-016
    assert.ok(robots.length > 0, 'obj/site/robots.txt must exist after build');
    const missing = ALL_TOKENS.filter((t) => !groupFor(t));
    assert.deepEqual(missing, [], `robots.txt must name every current crawler; missing: ${JSON.stringify(missing)}`);
    for (const token of ALL_TOKENS) {
      const g = groupFor(token);
      const allows = g.directives.filter(([k, v]) => k === 'allow' && v === '/');
      assert.ok(allows.length > 0, `${token} must carry an explicit "Allow: /" (D-5: explicit over implicit)`);
      const blanketDisallow = g.directives.some(([k, v]) => k === 'disallow' && v === '/');
      assert.ok(!blanketDisallow, `${token} must not be blocked under the allow-all policy`);
    }
  });

  it('test_when_robots_read_then_default_agent_allows_everything', () => { // AC-016
    const star = groupFor('*');
    assert.ok(star, 'robots.txt must carry a User-agent: * default group');
    assert.ok(
      star.directives.some(([k, v]) => k === 'allow' && v === '/'),
      'the default group must Allow: /',
    );
    assert.ok(
      !star.directives.some(([k, v]) => k === 'disallow' && v === '/'),
      'the default group must not carry a blanket Disallow: /',
    );
  });

  it('test_when_site_built_then_robots_carries_absolute_sitemap_line', () => { // AC-016
    const origin = siteOrigin();
    assert.ok(origin, 'CNAME must resolve a deploy origin');
    const sitemapLines = robots
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => /^sitemap:/i.test(l));
    assert.equal(sitemapLines.length, 1, 'robots.txt must carry exactly one Sitemap line');
    assert.equal(
      sitemapLines[0].replace(/^sitemap:\s*/i, ''),
      `${origin}/sitemap.xml`,
      'the Sitemap line must be absolute and derived from the CNAME origin',
    );
  });

  it('test_when_cname_changed_then_sitemap_line_follows', () => { // AC-016
    // No second hardcoded origin: the rendered Sitemap line must be built from
    // site.url, so a CNAME change carries through with no other edit.
    assert.ok(robots.length > 0, 'robots.txt must exist before its origins can be checked');
    const origin = siteOrigin();
    const hardcodedOthers = [...robots.matchAll(/https?:\/\/([^\s/]+)/g)]
      .map((m) => m[1])
      .filter((host) => `https://${host}` !== origin);
    assert.deepEqual(
      hardcodedOthers,
      [],
      `robots.txt must contain no origin other than the CNAME one; found ${JSON.stringify(hardcodedOthers)}`,
    );
  });

  it('test_when_robots_has_blanket_disallow_then_test_fails', () => { // AC-016
    // Detector self-check: prove the crawlability assertion has teeth.
    const offender = 'User-agent: *\nDisallow: /\n';
    const parsed = groups(offender)[0];
    assert.ok(
      parsed.directives.some(([k, v]) => k === 'disallow' && v === '/'),
      'the parser must detect a blanket Disallow so the real assertion cannot silently pass',
    );
  });

  it('test_when_robots_read_then_no_deprecated_tokens', () => { // AC-016
    assert.ok(robots.length > 0, 'robots.txt must exist before its tokens can be checked');
    const present = DEPRECATED.filter((t) => new RegExp(`^\\s*user-agent:\\s*${t}\\s*$`, 'im').test(robots));
    assert.deepEqual(
      present,
      [],
      `robots.txt must not use tokens absent from vendor docs; found ${JSON.stringify(present)}`,
    );
  });
});
