// GA4 instrumentation — built-site smoke (AC-001 prod, AC-006 dev).
//
// Build the eleventy site under each env state, then walk the rendered **.html
// and assert per-page presence/absence of the gtag loader.
//
// Each test owns one build invocation into its OWN output dir (isolation is what
// makes that safe): the two env states produce different pages, and writing both
// into the live obj/site made that tree flip content mid-suite while sibling
// tests ran audit-baseline against it — see helpers/site-build.mjs.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { buildSiteIsolated, htmlFilesIn } from './helpers/site-build.mjs';

const PROD_MEASUREMENT_ID = 'G-MYCZFYXE38';
const PROD_LOADER_RE = new RegExp(
  `googletagmanager\\.com/gtag/js\\?id=${PROD_MEASUREMENT_ID.replace(/[-]/g, '\\-')}`,
  'g'
);
const GTM_DOMAIN_RE = /googletagmanager\.com/;

function renderedHtml(label, envOverride) {
  const { outDir } = buildSiteIsolated(label, envOverride);
  const htmlFiles = htmlFilesIn(outDir);
  assert.ok(htmlFiles.length > 0, `the rendered site contained no .html files`);
  return { outDir, htmlFiles };
}

describe('ga4 built-site smoke (AC-001, AC-006)', () => {
  it('test_when_build_with_github_run_id_set_then_every_html_has_one_gtag_match', () => {
    const { outDir, htmlFiles } = renderedHtml('ga4-prod', { GITHUB_RUN_ID: 'gha-test-123' });

    const offenders = [];
    for (const file of htmlFiles) {
      const text = readFileSync(file, 'utf8');
      const matches = text.match(PROD_LOADER_RE) || [];
      if (matches.length !== 1) {
        offenders.push(`${path.relative(outDir, file)}: ${matches.length} matches`);
      }
    }
    assert.equal(
      offenders.length,
      0,
      `every built HTML page must have exactly one googletagmanager loader for ${PROD_MEASUREMENT_ID}; offenders:\n${offenders.join('\n')}`
    );
  });

  it('test_when_build_without_github_run_id_then_no_html_contains_googletagmanager', () => {
    const { outDir, htmlFiles } = renderedHtml('ga4-dev', { GITHUB_RUN_ID: undefined });

    const offenders = [];
    for (const file of htmlFiles) {
      const text = readFileSync(file, 'utf8');
      if (GTM_DOMAIN_RE.test(text)) {
        offenders.push(path.relative(outDir, file));
      }
    }
    assert.equal(
      offenders.length,
      0,
      `no built HTML page may contain googletagmanager.com when GITHUB_RUN_ID is unset; offenders:\n${offenders.join('\n')}`
    );
  });
});
