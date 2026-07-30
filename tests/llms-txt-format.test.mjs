// T7 — llms.txt per the llmstxt.org format: an H1 (the only required section),
// a blockquote summary, optional prose, then H2-delimited file lists whose
// entries are `[name](url)` with optional `: notes`.

import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { ensureSiteBuilt, readRendered, siteOrigin } from './helpers/site-build.mjs';

let llms = '';
const lines = () => llms.split('\n');

const h1s = () => lines().filter((l) => /^#\s+\S/.test(l));
const h2s = () => lines().filter((l) => /^##\s+\S/.test(l));

/** List entries under H2 sections, as raw strings. */
function fileListEntries() {
  const out = [];
  let inSection = false;
  for (const line of lines()) {
    if (/^##\s+\S/.test(line)) { inSection = true; continue; }
    if (/^#\s+\S/.test(line)) { inSection = false; continue; }
    if (inSection && /^\s*-\s+\S/.test(line)) out.push(line.trim());
  }
  return out;
}

describe('T7 — llms.txt conforms to the llmstxt.org format', () => {
  before(() => {
    ensureSiteBuilt();
    llms = readRendered('llms.txt');
  });

  it('test_when_llms_parsed_then_conforms_to_llmstxt_format', () => { // AC-017
    assert.ok(llms.length > 0, 'obj/site/llms.txt must exist after build');

    assert.equal(h1s().length, 1, 'exactly one H1 is required (the only required section)');

    const afterH1 = lines().slice(lines().findIndex((l) => /^#\s+\S/.test(l)) + 1);
    const firstMeaningful = afterH1.find((l) => l.trim().length > 0);
    assert.ok(
      firstMeaningful && firstMeaningful.trim().startsWith('>'),
      `a blockquote summary must follow the H1; got ${JSON.stringify(firstMeaningful)}`,
    );

    assert.ok(h2s().length >= 1, 'at least one H2-delimited file list is expected');

    const entries = fileListEntries();
    assert.ok(entries.length > 0, 'file-list sections must contain entries');
    for (const entry of entries) {
      assert.match(
        entry,
        /^-\s+\[[^\]]+\]\([^)]+\)(\s*:\s*.+)?$/,
        `each entry must be "- [name](url)" with optional ": notes"; got ${JSON.stringify(entry)}`,
      );
    }
  });

  it('test_when_llms_links_read_then_urls_are_absolute_from_cname_origin', () => { // AC-017
    const origin = siteOrigin();
    const urls = fileListEntries()
      .map((e) => /\(([^)]+)\)/.exec(e))
      .filter(Boolean)
      .map((m) => m[1]);
    assert.ok(urls.length > 0, 'llms.txt must link at least one page');
    for (const url of urls) {
      assert.ok(
        url.startsWith(`${origin}/`),
        `answer engines fetch llms.txt out of context, so every URL must be absolute under ${origin}; got ${url}`,
      );
    }
  });

  it('test_when_optional_section_present_then_it_is_last', () => { // AC-017
    // The spec gives "Optional" a designated meaning: its URLs may be skipped
    // when a shorter context is needed. That only holds if it is last.
    assert.ok(llms.length > 0, 'llms.txt must exist before its section order can be checked');
    const headings = h2s().map((h) => h.replace(/^##\s+/, '').trim());
    const idx = headings.findIndex((h) => /^optional$/i.test(h));
    if (idx === -1) {
      assert.ok(true, 'no Optional section present');
      return;
    }
    assert.equal(idx, headings.length - 1, 'the Optional section must come last so it can be truncated');
  });
});
