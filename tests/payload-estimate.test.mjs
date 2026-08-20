// work-planner-envelope — the forward estimate.
//
// The a-priori half exists so the batching decision can be made at triage, before
// the expensive discovery phases run. It will be wrong early; what these tests pin
// is that it is wrong in a bounded, measurable way rather than an unknown one.
//
// The back-test is the honest oracle: predicted against actual over the real
// archived corpus. A fixture assertion here would only prove the formula computes
// what the formula computes.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT, tryImport } from './helpers/memory-fixtures.mjs';

const ESTIMATOR = '.claude/skills/harness/payload-estimate.mjs';
const CORPUS = '.claude/skills/harness/timing-corpus.mjs';

// Measured 2026-08-20 over the 92 bundles instrumenting both sides. Recorded rather
// than tuned: raising this ceiling to make a run green is how the estimator becomes
// decoration.
const MEDIAN_ERROR_CEILING = 1.5;

describe('payload-estimate — purity', () => {
  it('test_when_structure_descriptor_given_then_the_estimate_is_deterministic', async () => {
    const mod = await tryImport(ESTIMATOR);
    assert.ok(mod, `${ESTIMATOR} must exist`);
    const descriptor = { track: 'intake-full', ac_count: 13, write_surface_count: 8, component_count: 0 };

    const a = mod.estimatePayload(descriptor);
    const b = mod.estimatePayload(descriptor);

    assert.equal(a, b, 'the estimator is pure; a triage estimate that moves between calls is not an estimate');
    assert.ok(a > 0, 'a zero estimate would classify every workflow under-floor before it started');
  });

  it('test_when_scope_grows_then_the_estimate_grows_with_it', async () => {
    const mod = await tryImport(ESTIMATOR);
    assert.ok(mod, `${ESTIMATOR} must exist`);
    const small = mod.estimatePayload({ track: 'tdd-quickfix', ac_count: 2, write_surface_count: 1, component_count: 0 });
    const large = mod.estimatePayload({ track: 'tdd-quickfix', ac_count: 20, write_surface_count: 12, component_count: 4 });

    assert.ok(large > small, 'monotonic in scope, or it carries no information at all');
  });

  it('test_when_descriptor_is_empty_then_the_estimate_is_still_usable', async () => {
    const mod = await tryImport(ESTIMATOR);
    assert.ok(mod, `${ESTIMATOR} must exist`);
    const v = mod.estimatePayload({});
    assert.ok(Number.isFinite(v) && v > 0,
      'triage may know almost nothing yet; the estimator must degrade to a floor rather than to NaN');
  });
});

describe('payload-estimate — back-test against the live archive', () => {
  it('test_when_backtested_over_the_archive_then_median_error_is_within_the_recorded_ceiling', async () => {
    const estimator = await tryImport(ESTIMATOR);
    const corpus = await tryImport(CORPUS);
    assert.ok(estimator, `${ESTIMATOR} must exist`);
    assert.ok(corpus, `${CORPUS} must exist`);

    const bundles = corpus.readCorpus({ rootDir: REPO_ROOT }).filter((b) => b.measured && b.payload_tokens > 0);
    assert.ok(bundles.length >= 50,
      `the back-test needs a real corpus; found ${bundles.length} measured bundles`);

    const errors = bundles.map((b) => {
      const predicted = estimator.estimatePayload({ track: b.track, ac_count: null, write_surface_count: null, component_count: null });
      return Math.abs(predicted - b.payload_tokens) / b.payload_tokens;
    }).sort((a, z) => a - z);

    const median = errors[Math.floor(errors.length / 2)];
    assert.ok(median <= MEDIAN_ERROR_CEILING,
      `median relative error ${median.toFixed(2)} exceeds the recorded ceiling ${MEDIAN_ERROR_CEILING} over ${bundles.length} bundles`);
  });
});

describe('timing-corpus — reading the rendered tables (D1, D2)', () => {
  it('test_when_a_bundle_carries_na_tokens_then_it_is_reported_unmeasured', async () => {
    const corpus = await tryImport(CORPUS);
    assert.ok(corpus, `${CORPUS} must exist`);
    const bundles = corpus.readCorpus({ rootDir: REPO_ROOT });

    assert.ok(bundles.length > 0, 'the live archive is not empty');
    for (const b of bundles) {
      assert.equal(typeof b.measured, 'boolean', 'every bundle states whether it was measured');
      if (!b.measured) {
        assert.notEqual(b.payload_tokens, 0,
          'D2: an unmeasured bundle must not be represented as a zero — that is the coercion the whole decision forbids');
      }
    }
  });

  it('test_when_the_live_archive_is_read_then_the_measured_share_matches_what_scout_found', async () => {
    const corpus = await tryImport(CORPUS);
    assert.ok(corpus, `${CORPUS} must exist`);
    const bundles = corpus.readCorpus({ rootDir: REPO_ROOT });
    const measured = bundles.filter((b) => b.measured);

    // Scout measured 92 of 117 bundles instrumenting both sides on 2026-08-20. The
    // corpus only grows, so this is a floor, not an equality.
    assert.ok(measured.length >= 90,
      `expected at least 90 measured bundles (scout found 92); got ${measured.length}`);
  });
});
