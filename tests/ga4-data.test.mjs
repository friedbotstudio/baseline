// GA4 instrumentation — data file env-gate (AC-001 prod path, AC-006 dev path).
//
// site-src/_data/analytics.js reads process.env.GITHUB_RUN_ID:
//   prod (set): { measurement_id: "G-MYCZFYXE38" }
//   dev (unset): { measurement_id: null }
//
// Cache-busted dynamic import (`?t=` query suffix per
// .claude/memory/conventions.md → test-esm-env-cache-bust) lets the same module
// be evaluated under each env state without bleed-through from Node's ESM cache.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ANALYTICS_DATA_PATH = path.join(REPO_ROOT, 'site-src/_data/analytics.js');
const PROD_MEASUREMENT_ID = 'G-MYCZFYXE38';

async function importAnalyticsData() {
  const url = pathToFileURL(ANALYTICS_DATA_PATH).href + '?t=' + Date.now() + '-' + Math.random();
  const mod = await import(url);
  return mod.default;
}

describe('ga4 analytics data file — env gate (AC-001, AC-006)', () => {
  it('test_when_data_imported_with_github_run_id_set_then_measurement_id_is_prod', async () => {
    const previous = process.env.GITHUB_RUN_ID;
    process.env.GITHUB_RUN_ID = 'gha-test-123';
    try {
      const data = await importAnalyticsData();
      assert.equal(
        data.measurement_id,
        PROD_MEASUREMENT_ID,
        `expected measurement_id="${PROD_MEASUREMENT_ID}" when GITHUB_RUN_ID is set; got ${JSON.stringify(data.measurement_id)}`
      );
    } finally {
      if (previous === undefined) delete process.env.GITHUB_RUN_ID;
      else process.env.GITHUB_RUN_ID = previous;
    }
  });

  it('test_when_data_imported_without_github_run_id_then_measurement_id_is_null', async () => {
    const previous = process.env.GITHUB_RUN_ID;
    delete process.env.GITHUB_RUN_ID;
    try {
      const data = await importAnalyticsData();
      assert.equal(
        data.measurement_id,
        null,
        `expected measurement_id=null when GITHUB_RUN_ID is unset; got ${JSON.stringify(data.measurement_id)}`
      );
    } finally {
      if (previous !== undefined) process.env.GITHUB_RUN_ID = previous;
    }
  });
});
