// Build-id integration with the eleventy site (AC-009 site portion).
//
// Three tests:
//   1. site-src/_includes/footer.njk interpolates `build.build_id` (structural
//      assertion — does not require running eleventy).
//   2. site-src/_data/build.js exports a `build_id` of `gha-<id>` when
//      GITHUB_RUN_ID is set.
//   3. site-src/_data/build.js falls back to `dev` when GITHUB_RUN_ID is unset.
//
// The data module is dynamically imported with a manipulated env so each test
// gets a fresh module evaluation. Cache-busting via a query string ensures
// repeated imports re-evaluate (Node's ESM loader caches by URL).

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FOOTER_NJK = path.join(REPO_ROOT, 'site-src/_includes/footer.njk');
const BUILD_DATA_PATH = path.join(REPO_ROOT, 'site-src/_data/build.js');

function readFooter() {
  if (!existsSync(FOOTER_NJK)) {
    throw new Error(
      `site-src/_includes/footer.njk does not exist — expected at ${FOOTER_NJK}`
    );
  }
  return readFileSync(FOOTER_NJK, 'utf8');
}

async function importBuildData(env = {}) {
  if (!existsSync(BUILD_DATA_PATH)) {
    throw new Error(
      `site-src/_data/build.js does not exist yet — implement worker must create it. ` +
      `Expected at: ${BUILD_DATA_PATH}`
    );
  }
  const saved = { GITHUB_RUN_ID: process.env.GITHUB_RUN_ID };
  delete process.env.GITHUB_RUN_ID;
  if (Object.prototype.hasOwnProperty.call(env, 'GITHUB_RUN_ID')) {
    process.env.GITHUB_RUN_ID = env.GITHUB_RUN_ID;
  }
  try {
    // Cache-bust by appending a unique query string to the import URL.
    const url = pathToFileURL(BUILD_DATA_PATH).href + `?t=${Date.now()}-${Math.random()}`;
    const mod = await import(url);
    // Eleventy global data files may export either an object literal or a
    // function (sync or async). Resolve both shapes.
    const raw = mod.default ?? mod;
    return typeof raw === 'function' ? await raw() : raw;
  } finally {
    if (saved.GITHUB_RUN_ID === undefined) {
      delete process.env.GITHUB_RUN_ID;
    } else {
      process.env.GITHUB_RUN_ID = saved.GITHUB_RUN_ID;
    }
  }
}

describe('footer.njk — build-id interpolation (AC-009 site portion)', () => {
  it('test_when_footer_njk_is_read_then_it_interpolates_build_id_from_build_data', () => {
    const text = readFooter();
    assert.match(
      text,
      /\{\{\s*build\.build_id\b/,
      'footer.njk must interpolate `{{ build.build_id }}` (the data file at site-src/_data/build.js becomes the `build` global)'
    );
  });
});

describe('site-src/_data/build.js — runtime build_id resolution', () => {
  it('test_when_build_data_module_loaded_with_github_run_id_then_returns_gha_prefixed_id', async () => {
    const data = await importBuildData({ GITHUB_RUN_ID: '12345' });
    assert.equal(
      data?.build_id,
      'gha-12345',
      `build.js must return { build_id: "gha-12345" } when GITHUB_RUN_ID=12345; got: ${JSON.stringify(data)}`
    );
  });

  it('test_when_build_data_module_loaded_without_github_run_id_then_returns_dev', async () => {
    const data = await importBuildData(); // GITHUB_RUN_ID unset
    assert.equal(
      data?.build_id,
      'dev',
      `build.js must return { build_id: "dev" } when GITHUB_RUN_ID is unset; got: ${JSON.stringify(data)}`
    );
  });
});
