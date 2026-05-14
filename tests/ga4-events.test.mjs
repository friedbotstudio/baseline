// GA4 instrumentation — event-handler structural assertions (AC-003 CTA, AC-004 copy).
//
// site-src/assets/site.js is a passthrough-copied browser script. Behavioural
// tests would need jsdom or similar, which is forbidden by this repo's
// DEPS_FORBIDDEN convention (.claude/memory/conventions.md → test-yaml-line-parsing).
// We test the code SHAPE instead: the listener selectors are present, the gtag
// event names + parameters are present, the double-count guard separates
// [data-cta] from [data-copy] selectors, and the `typeof window.gtag` guard
// is in place. Behaviour is then exercised in production by the operator
// post-deploy via GA4 DebugView (per spec AC-007 / rollout checklist).

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE_JS = path.join(REPO_ROOT, 'site-src/assets/site.js');

function readSiteJs() {
  if (!existsSync(SITE_JS)) {
    throw new Error(`site-src/assets/site.js does not exist — expected at ${SITE_JS}`);
  }
  return readFileSync(SITE_JS, 'utf8');
}

describe('ga4 event handlers — structural shape (AC-003, AC-004)', () => {
  it('test_when_site_js_read_then_cta_listener_registers_on_data_cta_selector', () => {
    const text = readSiteJs();
    assert.match(
      text,
      /querySelectorAll\(\s*['"]\[data-cta\]['"]\s*\)/,
      'site.js must register a delegated CTA listener via querySelectorAll("[data-cta]")'
    );
  });

  it('test_when_site_js_read_then_cta_listener_calls_select_content_with_cta_content_type', () => {
    const text = readSiteJs();
    assert.match(
      text,
      /gtag\(\s*['"]event['"]\s*,\s*['"]select_content['"]/,
      'site.js must call gtag("event", "select_content", ...) for CTA clicks'
    );
    assert.match(
      text,
      /content_type:\s*['"]cta['"]/,
      'select_content event must carry content_type: "cta"'
    );
    assert.match(
      text,
      /content_id:\s*\w+\.getAttribute\(\s*['"]data-cta['"]\s*\)/,
      'select_content event must carry content_id from the element\'s data-cta attribute'
    );
  });

  it('test_when_site_js_read_then_copy_handler_fires_copy_install_command_with_command_param', () => {
    const text = readSiteJs();
    assert.match(
      text,
      /gtag\(\s*['"]event['"]\s*,\s*['"]copy_install_command['"]/,
      'site.js must call gtag("event", "copy_install_command", ...) inside the [data-copy] handler'
    );
    assert.match(
      text,
      /command:\s*\w+/,
      'copy_install_command event must carry a `command` parameter with the copied text'
    );
  });

  it('test_when_site_js_read_then_cta_and_copy_use_non_overlapping_selectors', () => {
    const text = readSiteJs();
    // CTA listener must NOT key off [data-copy], and copy handler must NOT key off [data-cta].
    // The double-count guard is the selector separation: cli-strip has [data-copy] but not [data-cta],
    // so it falls through the CTA listener entirely.
    const ctaListenerBlock = text.match(/querySelectorAll\(\s*['"]\[data-cta\]['"]\s*\)[\s\S]{0,800}/);
    assert.ok(ctaListenerBlock, 'expected to locate the [data-cta] listener block for selector-isolation check');
    assert.doesNotMatch(
      ctaListenerBlock[0],
      /\[data-copy\]/,
      'CTA listener block must NOT also match [data-copy] — that would double-count cli-strip'
    );
  });

  it('test_when_site_js_read_then_gtag_undefined_guard_present', () => {
    const text = readSiteJs();
    assert.match(
      text,
      /typeof\s+(window\.)?gtag\s*===\s*['"]function['"]/,
      'site.js must guard gtag calls with `typeof gtag === "function"` (or `typeof window.gtag === "function"`) to silent-no-op when the loader has not initialized'
    );
  });
});
