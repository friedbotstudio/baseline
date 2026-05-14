// Smoke test for the BUILT site artifact: walk every `*.html` in obj/site/
// after `npm run build:site` and assert no internal href/src starts with `/`.
// External URLs (https://, mailto:, //cdn., #fragment, data:, javascript:)
// are exempt. Catches future regressions where a contributor adds a
// leading-slash href without piping through the eleventy `rel` filter.
//
// Unit tests for the underlying `relUrl` function live at tests/rel-url.test.mjs.
//
// The smoke test invokes the build before walking — slower but reliable.
// Skip the build step (when iterating locally and obj/site/ is fresh) by
// setting SITE_RELATIVE_PATHS_SKIP_BUILD=1.

import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE_DIR = path.join(REPO_ROOT, 'obj/site');
const skipBuild = process.env.SITE_RELATIVE_PATHS_SKIP_BUILD === '1';

describe('site smoke — built artifact has no internal leading-slash refs', () => {
  before(() => {
    if (skipBuild) return;
    const result = spawnSync('npm', ['run', 'build:site'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      timeout: 60_000,
    });
    if (result.status !== 0) {
      throw new Error(
        `npm run build:site failed (exit ${result.status})\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`
      );
    }
  });

  it('test_when_obj_site_html_walked_then_no_link_or_script_or_a_or_img_uses_internal_leading_slash', () => {
    assert.ok(
      existsSync(SITE_DIR),
      `obj/site/ does not exist; run \`npm run build:site\` (or unset SITE_RELATIVE_PATHS_SKIP_BUILD=1)`
    );
    const htmlFiles = walkHtml(SITE_DIR);
    assert.ok(htmlFiles.length > 0, `obj/site/ contained no .html files`);

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
      const rel = path.relative(REPO_ROOT, file);
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

function walkHtml(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      out.push(...walkHtml(full));
    } else if (name.endsWith('.html')) {
      out.push(full);
    }
  }
  return out;
}
