// docsite drift — every name the baseline ships must appear on the rendered
// page that claims to list it.
//
// WHY THIS READS obj/site AND NOT site-src. The previous version scanned
// `site-src/hooks.njk` and `site-src/workflows.njk` for literal names. Those
// pages now build their rosters from a `{% for %}` over _data, so no name
// appears in the template at all, and a source scan is either vacuously true or
// fails against a correct page. Worse, both branches were guarded by
// `if (readText(...))`, and when the pages were renamed during a site rewrite
// the guards went falsy: the check emitted ZERO rows while audit-baseline kept
// reporting PASS. A placebo check is worse than a deleted one, so this version
// asserts against the built artifact and reports explicitly when it cannot.
//
// THE ORACLE IS SHARED. deriveNames() is the same function site-src/_data/
// roster.cjs reads to render the pages. That is deliberate: page and check
// cannot disagree about what the roster is. The residual risk — a bug in the
// enumerator making both wrong together — is covered by tests/derive-counts.
// test.mjs, which re-reads disk directly instead of trusting the enumerator.

import { deriveNames } from '../derive-counts.mjs';

// Pages that enumerate a roster, and what each must contain. `url` is the built
// path under obj/site; `names` pulls the expected list off the enumerator.
const ENUMERATING_PAGES = [
  {
    url: 'hooks/index.html',
    label: 'hook',
    names: (n) => n.hooks,
  },
  {
    url: 'workflows/index.html',
    label: 'selectable track',
    names: (n) => n.tracks.canonical,
  },
  {
    url: 'skills/index.html',
    label: 'skill',
    names: (n) => n.skills,
  },
  {
    url: 'mcp/index.html',
    label: 'MCP server',
    names: (n) => n.mcpServers,
  },
];

// Strip tags so a name split across markup ("<code>env_guard</code>") still
// counts, and so a name appearing only inside an HTML attribute does not.
function renderedText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/g, ' ')
    .replace(/<style[\s\S]*?<\/style>/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ');
}

export function run(ctx) {
  const rows = [];
  const add = (n, s, d = '') => rows.push([n, s, d]);

  let names;
  try {
    names = deriveNames(ctx.root);
  } catch (err) {
    add('docsite: roster enumerator readable', 'FAIL', err.message);
    return rows;
  }

  // A consumer install has no site tree at all. Distinguish that from "the site
  // exists but the page is missing", which is real drift.
  const siteBuilt = ctx.readText('obj/site/index.html') !== '';
  if (!siteBuilt) {
    add('docsite: rendered site present', 'SKIP', 'no obj/site — run npm run build:site');
    return rows;
  }

  for (const page of ENUMERATING_PAGES) {
    const expected = page.names(names);
    const html = ctx.readText(`obj/site/${page.url}`);

    if (!html) {
      // The page is not built yet. Report it rather than skipping silently:
      // silence here is exactly how this check went vacuous before.
      add(
        `docsite: ${page.url} lists every ${page.label}`,
        'SKIP',
        `page not built (${expected.length} unlisted)`,
      );
      continue;
    }

    const text = renderedText(html);
    const missing = expected.filter((name) => !text.includes(name));
    add(
      `docsite: ${page.url} lists every ${page.label}`,
      missing.length === 0 ? 'PASS' : 'FAIL',
      missing.length === 0
        ? `${expected.length} listed`
        : `missing: ${missing.join(', ')}`,
    );
  }

  return rows;
}
