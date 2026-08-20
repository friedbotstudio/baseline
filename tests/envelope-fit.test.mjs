// work-planner-envelope — fitting the per-track envelope from the archived corpus.
//
// The envelope is what a workflow costs before it carries any work. Every ratio the
// planner reports is a division by this number, so the two ways it can be wrong are
// the two ways every downstream verdict goes wrong: a bundle counted that should not
// have been (D2), and tracks pooled that should have been separate (D3).

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { tryImport } from './helpers/memory-fixtures.mjs';
import { corpusRoot, writeBundle, writeBundles } from './helpers/timing-corpus-fixtures.mjs';

const ENVELOPE = '.claude/skills/harness/envelope.mjs';

// Payload 1000, envelope 300. Chosen so a mis-split is visible in the number itself
// rather than only in a boolean.
const ROWS = [['tdd', 1000], ['security', 100], ['integrate', 150], ['archive', 50]];

describe('envelopeFor — fitting', () => {
  it('test_when_corpus_has_measured_bundles_then_fit_names_its_sample_count', async () => {
    const mod = await tryImport(ENVELOPE);
    assert.ok(mod, `${ENVELOPE} must exist`);
    const root = writeBundles(corpusRoot(), { track: 'intake-full', count: 7, rows: ROWS });

    const fit = mod.envelopeFor({ rootDir: root, track: 'intake-full' });

    assert.equal(fit.fitted, true, 'seven bundles is above any sane threshold');
    assert.equal(fit.sample_count, 7, 'AC-001: the fit must say how many bundles it saw');
    assert.equal(fit.source, 'corpus');
    assert.equal(fit.envelope_tokens, 300, 'envelope is every non-payload phase summed: 100 + 150 + 50');
  });

  it('test_when_corpus_is_empty_then_shipped_default_returned_unfitted', async () => {
    const mod = await tryImport(ENVELOPE);
    assert.ok(mod, `${ENVELOPE} must exist`);

    const fit = mod.envelopeFor({ rootDir: corpusRoot(), track: 'intake-full' });

    assert.equal(fit.fitted, false, 'AC-002: a borrowed number must never report itself as measured');
    assert.equal(fit.source, 'shipped-default');
    assert.equal(fit.sample_count, 0);
    assert.ok(fit.envelope_tokens > 0, 'a zero default would make every ratio infinite');
  });

  it('test_when_token_cell_is_not_an_integer_then_bundle_is_excluded_not_zeroed', async () => {
    const mod = await tryImport(ENVELOPE);
    assert.ok(mod, `${ENVELOPE} must exist`);
    const root = writeBundles(corpusRoot(), { track: 'intake-full', count: 5, rows: ROWS });
    // Six archived bundles really carry `n/a` — the transcript was unavailable, which
    // is not the same as costing nothing.
    writeBundle(root, {
      day: '2026-02-01', slug: 'unmeasured', track: 'intake-full',
      rows: [['tdd', 'n/a'], ['security', 'n/a'], ['integrate', 'n/a'], ['archive', 'n/a']],
    });

    const fit = mod.envelopeFor({ rootDir: root, track: 'intake-full' });

    assert.equal(fit.sample_count, 5, 'the n/a bundle must be excluded, not counted');
    assert.equal(fit.envelope_tokens, 300,
      'coercing n/a to zero would drag the fitted envelope down and do it silently — the exact failure D2 forbids');
  });

  it('test_when_tracks_differ_then_each_fits_independently', async () => {
    const mod = await tryImport(ENVELOPE);
    assert.ok(mod, `${ENVELOPE} must exist`);
    const root = corpusRoot();
    writeBundles(root, { track: 'intake-full', count: 6, rows: ROWS, prefix: 'heavy' });
    writeBundles(root, {
      track: 'tdd-quickfix', count: 6, prefix: 'light',
      rows: [['tdd', 1000], ['security', 20], ['integrate', 20], ['archive', 10]],
    });

    const heavy = mod.envelopeFor({ rootDir: root, track: 'intake-full' });
    const light = mod.envelopeFor({ rootDir: root, track: 'tdd-quickfix' });

    assert.equal(heavy.envelope_tokens, 300);
    assert.equal(light.envelope_tokens, 50);
    assert.notEqual(heavy.envelope_tokens, light.envelope_tokens,
      'D3: measured per-track medians span 0.66x to 4.05x, so one pooled envelope misprices nearly every track');
  });

  it('test_when_samples_below_min_fit_then_shipped_default_wins', async () => {
    const mod = await tryImport(ENVELOPE);
    assert.ok(mod, `${ENVELOPE} must exist`);
    const root = writeBundles(corpusRoot(), { track: 'intake-full', count: 2, rows: ROWS });

    const fit = mod.envelopeFor({ rootDir: root, track: 'intake-full', minFitSamples: 5 });

    assert.equal(fit.fitted, false, 'D4: two bundles is not a median, it is an anecdote');
    assert.equal(fit.source, 'shipped-default');
    assert.equal(fit.sample_count, 2, 'the count is still reported so the operator can see how close they are');
  });

  it('test_when_a_track_is_absent_from_the_corpus_then_the_default_is_returned', async () => {
    const mod = await tryImport(ENVELOPE);
    assert.ok(mod, `${ENVELOPE} must exist`);
    const root = writeBundles(corpusRoot(), { track: 'intake-full', count: 6, rows: ROWS });

    const fit = mod.envelopeFor({ rootDir: root, track: 'epic-child' });

    assert.equal(fit.fitted, false);
    assert.equal(fit.sample_count, 0, 'another track\'s bundles are not this track\'s evidence');
  });
});
