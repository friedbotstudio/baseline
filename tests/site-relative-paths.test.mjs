// Smoke test for the BUILT site artifact: walk every `*.html` in obj/site/
// after `npm run build:site` and assert no internal href/src starts with `/`.
// External URLs (https://, mailto:, //cdn., #fragment, data:, javascript:)
// are exempt. Catches future regressions where a contributor adds a
// leading-slash href without piping through the eleventy `rel` filter.
//
// Unit tests for the underlying `relUrl` function live at tests/rel-url.test.mjs.
//
// The smoke test builds before walking — slower but reliable. The build goes to
// this process's own output dir via helpers/site-build.mjs, never the live
// obj/site, which audit-baseline reads concurrently. Skip the build (when
// iterating locally against a tree you just built) with SITE_SKIP_BUILD=1.

import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { ensureSiteBuilt, renderedPath, htmlFilesIn } from './helpers/site-build.mjs';

describe('site smoke — built artifact has no internal leading-slash refs', () => {
  before(() => {
    ensureSiteBuilt();
  });

  it('test_when_obj_site_html_walked_then_no_link_or_script_or_a_or_img_uses_internal_leading_slash', () => {
    const siteDir = renderedPath('.');
    assert.ok(
      existsSync(siteDir),
      `the rendered site is missing; unset SITE_SKIP_BUILD=1 or run \`npm run build:site\``
    );
    const htmlFiles = htmlFilesIn(siteDir);
    assert.ok(htmlFiles.length > 0, `the rendered site contained no .html files`);

    // Match href= or src= whose value starts with `/` followed by a
    // non-slash, non-fragment character. Captures things like:
    //   href="/assets/x"   src="/assets/x"   href='/hooks/'
    // But NOT:
    //   href="//cdn..."    href="https://..."   href="#x"
    //   href="data:..."    src="data:..."
    const RE = /\b(href|src)\s*=\s*["'](\/[^/"'#][^"']*)["']/g;
    const offenders = [];
    for (const file of htmlFiles) {
      const text = readFileSync(file, 'utf8');
      const rel = path.relative(siteDir, file);
      for (const m of text.matchAll(RE)) {
        const lineNo = text.slice(0, m.index).split('\n').length;
        offenders.push(`${rel}:${lineNo}: ${m[1]}="${m[2]}"`);
      }
    }
    assert.deepEqual(
      offenders,
      [],
      `Found ${offenders.length} internal leading-slash href/src in built artifact (must pipe through \`| rel\` filter):\n${offenders.join('\n')}`
    );
  });
});
