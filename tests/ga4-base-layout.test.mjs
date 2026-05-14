// GA4 instrumentation — base.njk structural assertions (AC-001).
//
// Two tests:
//   1. base.njk contains the {% if analytics.measurement_id %} guarded block
//      with the gtag.js loader + dataLayer init + config call.
//   2. Regression trap: existing head content (title, meta description, font
//      preconnects, console-signature IIFE marker) is still present so the
//      gtag insertion did not displace prior structure.
//
// Read-only structural assertions over the file text. No eleventy invocation.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE_NJK = path.join(REPO_ROOT, 'site-src/_layouts/base.njk');

function readBase() {
  if (!existsSync(BASE_NJK)) {
    throw new Error(`site-src/_layouts/base.njk does not exist — expected at ${BASE_NJK}`);
  }
  return readFileSync(BASE_NJK, 'utf8');
}

describe('ga4 base layout — gated gtag block (AC-001)', () => {
  it('test_when_base_njk_read_then_contains_gated_gtag_block', () => {
    const text = readBase();
    assert.match(
      text,
      /\{%\s*if\s+analytics\.measurement_id\s*%\}/,
      'base.njk must contain `{% if analytics.measurement_id %}` to gate the gtag block on prod-only emission'
    );
    assert.match(
      text,
      /googletagmanager\.com\/gtag\/js\?id=\{\{\s*analytics\.measurement_id\s*\}\}/,
      'base.njk must reference googletagmanager.com/gtag/js?id={{ analytics.measurement_id }} inside the guarded block'
    );
    assert.match(
      text,
      /gtag\(\s*['"]config['"]\s*,\s*['"]\{\{\s*analytics\.measurement_id\s*\}\}['"]\s*\)/,
      "base.njk must call gtag('config', '{{ analytics.measurement_id }}') inside the guarded block"
    );
    assert.match(
      text,
      /\{%\s*endif\s*%\}/,
      'base.njk must close the gtag block with `{% endif %}`'
    );
  });

  it('test_when_base_njk_read_then_existing_head_content_intact', () => {
    const text = readBase();
    assert.match(text, /<title>\{\{\s*pageTitle\s*\}\}<\/title>/, 'base.njk must still contain the <title> tag');
    assert.match(text, /<meta\s+name="description"/, 'base.njk must still contain <meta name="description">');
    assert.match(text, /<link\s+rel="preconnect"\s+href="https:\/\/fonts\.googleapis\.com"/, 'first font preconnect link must survive');
    assert.match(text, /<link\s+rel="preconnect"\s+href="https:\/\/fonts\.gstatic\.com"/, 'second font preconnect link must survive');
    assert.match(text, /Console signature for engineers who open DevTools/, 'console-signature IIFE comment marker must survive');
  });
});
