// GA4 event hooks — the markup half, which nothing covered.
//
// `ga4-events.test.mjs` reads site-src/assets/site.js and asserts the HANDLERS are
// shaped right: the selectors, the event names, the parameters, the gtag guard.
// Ten tests, all green, and every one of them stays green if the attributes those
// handlers listen for vanish from the templates. A listener bound to a selector
// that matches nothing is a silent zero in the report, and a zero looks the same
// as "nobody clicked".
//
// Measured 2026-08-25: the classes the approved spec named as the CTAs
// (`.btn-primary` / `.btn-secondary`) no longer exist anywhere in the built site.
// The four markers survived only because site.js keys on `[data-cta]` alone rather
// than on a class, which is a decision its own comment records. That is the
// mechanism working — and it worked unobserved, which is what this closes.

import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';

import { ensureSiteBuilt, readRendered, renderedPages } from './helpers/site-build.mjs';

const CTA_ATTR = /data-cta="([^"]*)"/g;
const COPY_BUTTON = /<[a-z]+[^>]*class="[^"]*\bjs-copy\b[^"]*"[^>]*>/gi;

// Both quote styles, because a copied command containing double quotes is written
// with single ones — `data-copy='/triage "your request"'` is on two pages. A
// double-quote-only reader calls those buttons uninstrumented and sends whoever
// reads it looking for a defect in the site.
const COPY_PAYLOAD = /data-copy=("([^"]*)"|'([^']*)')/;

let pages = [];

function everyMatch(re) {
  const found = [];
  for (const rel of pages) {
    const html = readRendered(rel);
    for (const m of html.matchAll(new RegExp(re.source, re.flags))) found.push({ rel, m });
  }
  return found;
}

describe('ga4 — the rendered site still carries the hooks the handlers listen for', () => {
  before(() => {
    ensureSiteBuilt();
    pages = renderedPages();
    assert.ok(pages.length > 0, 'the rendered site contained no pages to scan');
  });

  it('test_when_the_site_is_scanned_then_at_least_one_data_cta_marker_survives', () => {
    const ctas = everyMatch(CTA_ATTR);
    assert.ok(
      ctas.length > 0,
      'no element in the rendered site carries [data-cta], so the select_content listener binds to nothing and that event reports zero forever',
    );
  });

  it('test_when_the_site_is_scanned_then_at_least_one_copy_button_survives', () => {
    const buttons = everyMatch(COPY_BUTTON);
    assert.ok(
      buttons.length > 0,
      'no element in the rendered site carries .js-copy, so copy_install_command binds to nothing',
    );
  });

  it('test_when_every_copy_button_is_read_then_it_carries_a_command_to_report', () => {
    const empty = everyMatch(COPY_BUTTON)
      .filter(({ m }) => {
        const payload = COPY_PAYLOAD.exec(m[0]);
        if (!payload) return true;
        return (payload[2] ?? payload[3] ?? '').trim() === '';
      })
      .map(({ rel }) => rel);

    assert.deepEqual(
      [...new Set(empty)],
      [],
      'the copy handler reports `command: button.getAttribute("data-copy") || ""`, so a copy button without one fires the event with an empty command and the row is unattributable',
    );
  });

  it('test_when_cta_ids_are_collected_then_none_is_empty_or_duplicated', () => {
    const seen = new Map();
    const faults = [];
    for (const { rel, m } of everyMatch(CTA_ATTR)) {
      const id = m[1].trim();
      if (id === '') {
        faults.push(`${rel}: an empty data-cta reports select_content with no content_id`);
        continue;
      }
      // GA4 aggregates by content_id, so two CTAs sharing one id are one row in
      // the report and neither can be read on its own again.
      if (seen.has(id)) faults.push(`${rel}: data-cta="${id}" already used in ${seen.get(id)}`);
      else seen.set(id, rel);
    }

    assert.deepEqual(faults, [], 'each data-cta value becomes a GA4 content_id and has to identify one thing');
  });
});
