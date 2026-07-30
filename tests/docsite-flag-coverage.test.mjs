// Public-site drift traps (site-epic-currency, 2026-07-05).
//
// Two drift classes the docsite audit's count checks cannot see:
//   1. A CLI flag added to bin/cli.js OPTIONS but never documented on the
//      public CLI page (found live: --no-ci-posture missing from cli.njk).
//   2. A selectable track added to workflows.jsonl but missing from the
//      index page's hardcoded track-chip list (found live: org missing).
// Both are subset assertions: the site may say MORE (an explicitly-labeled
// upcoming chip is fine); it must never omit a shipped surface.

import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ensureSiteBuilt, readRendered } from './helpers/site-build.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(here, '..');

async function readRepoFile(rel) {
  return readFile(resolve(REPO_ROOT, rel), 'utf8');
}

function extractCliOptionFlags(cliSource) {
  const block = /const OPTIONS = \{([\s\S]*?)\n\};/.exec(cliSource);
  assert.ok(block, 'bin/cli.js must declare the OPTIONS object');
  const flags = [...block[1].matchAll(/^\s*'?([a-z][a-z0-9-]*)'?:\s*\{/gm)].map((m) => m[1]);
  assert.ok(flags.length >= 5, `expected the parseArgs option set, got: ${flags.join(', ')}`);
  return flags;
}

function extractSelectableTrackIds(workflowsJsonl) {
  const ids = [];
  for (const line of workflowsJsonl.split('\n')) {
    if (!line.trim()) continue;
    const track = JSON.parse(line);
    if (track.selectable === true) ids.push(track.track_id);
  }
  assert.ok(ids.length >= 5, `expected the selectable track set, got: ${ids.join(', ')}`);
  return ids;
}

describe('public site covers the shipped CLI and track surfaces', () => {
  // Asserts against the RENDERED page, not the .njk source. The CLI page builds
  // its flag table from a `{% for %}` over _data/cli.cjs, so no flag literal
  // appears in the template at all; a source scan would fail against a
  // correct page, and the obvious "fix" would be to hand-write the table and
  // silently abandon the derive-from-data contract. Reading obj/site is also
  // the stronger assertion: it checks what a visitor receives.
  before(() => {
    ensureSiteBuilt();
  });

  it('test_when_cli_flags_documented_then_site_cli_page_covers_every_flag', async () => {
    const cliSource = await readRepoFile('bin/cli.js');
    const cliPage = readRendered('cli/index.html');
    assert.ok(
      cliPage.length > 0,
      'obj/site/cli/index.html must exist; the CLI reference page is expected to render',
    );
    const missing = extractCliOptionFlags(cliSource).filter(
      (flag) => !cliPage.includes(`--${flag}`),
    );
    assert.deepEqual(
      missing,
      [],
      `the rendered CLI page must document every bin/cli.js flag; missing: ${missing.map((f) => `--${f}`).join(', ')}`,
    );
  });

  it('test_when_selectable_tracks_on_disk_then_index_chips_cover_them', async () => {
    // The track surface moved. The homepage used to carry a `track-chip` per
    // track; the rewrite has it name the count and link onward, and the
    // enumeration lives on the Workflow tracks reference page. So the assertion
    // follows the surface: every selectable track must appear on the rendered
    // page that claims to list them.
    const workflowsJsonl = await readRepoFile('.claude/workflows.jsonl');
    const tracksPage = readRendered('workflows/index.html');
    assert.ok(
      tracksPage.length > 0,
      'obj/site/workflows/index.html must exist; the track reference page is expected to render',
    );
    const missing = extractSelectableTrackIds(workflowsJsonl).filter(
      (trackId) => !new RegExp(`id="track-${trackId}"`).test(tracksPage),
    );
    assert.deepEqual(
      missing,
      [],
      `the rendered track page must carry a cell for every selectable track; missing: ${missing.join(', ')}`,
    );
  });
});
