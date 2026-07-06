// Public-site drift traps (site-epic-currency, 2026-07-05).
//
// Two drift classes the docsite audit's count checks cannot see:
//   1. A CLI flag added to bin/cli.js OPTIONS but never documented on the
//      public CLI page (found live: --no-ci-posture missing from cli.njk).
//   2. A selectable track added to workflows.jsonl but missing from the
//      index page's hardcoded track-chip list (found live: org missing).
// Both are subset assertions: the site may say MORE (an explicitly-labeled
// upcoming chip is fine); it must never omit a shipped surface.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

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
  it('test_when_cli_flags_documented_then_site_cli_page_covers_every_flag', async () => {
    const [cliSource, cliPage] = await Promise.all([
      readRepoFile('bin/cli.js'),
      readRepoFile('site-src/cli.njk'),
    ]);
    const missing = extractCliOptionFlags(cliSource).filter(
      (flag) => !cliPage.includes(`--${flag}`),
    );
    assert.deepEqual(
      missing,
      [],
      `site-src/cli.njk must document every bin/cli.js flag; missing: ${missing.map((f) => `--${f}`).join(', ')}`,
    );
  });

  it('test_when_selectable_tracks_on_disk_then_index_chips_cover_them', async () => {
    const [workflowsJsonl, indexPage] = await Promise.all([
      readRepoFile('.claude/workflows.jsonl'),
      readRepoFile('site-src/index.njk'),
    ]);
    const missing = extractSelectableTrackIds(workflowsJsonl).filter(
      (trackId) => !new RegExp(`track-chip[^>]*>\\s*${trackId}\\s*<`).test(indexPage),
    );
    assert.deepEqual(
      missing,
      [],
      `site-src/index.njk track chips must include every selectable track; missing: ${missing.join(', ')}`,
    );
  });
});
