// Domain — what a workflow costs before it carries any work.
//
// Every ratio the planner reports is a division by this number, so the two ways it
// goes wrong are the two ways every downstream verdict goes wrong: counting a
// bundle that should have been excluded (D2), and pooling tracks that should have
// been separate (D3). Measured per-track medians span 0.66x to 4.05x, so a single
// global envelope misprices nearly every track in one direction or the other.

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { readCorpus } from './timing-corpus.mjs';

// Fitted from this repository's corpus on 2026-08-20 and shipped so a fresh install
// has a usable envelope at zero history (AC-002). An operator's own fit replaces
// these as soon as they have MIN_FIT_SAMPLES bundles for the track; until then the
// verdict reports `fitted: false` so a borrowed number is never read as measured.
const SHIPPED_DEFAULTS = Object.freeze({
  'intake-full': 26000,
  'spec-entry': 21000,
  'tdd-quickfix': 9000,
  'epic-child': 8000,
  'epic': 18000,
  'power': 24000,
  'chore': 6000,
  'freeform': 6000,
});
const FALLBACK_DEFAULT = 15000;

const MIN_FIT_SAMPLES = 5;

function median(values) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

function configuredMinSamples(rootDir) {
  const path = join(rootDir, '.claude/project.json');
  if (!existsSync(path)) return MIN_FIT_SAMPLES;
  try {
    const value = JSON.parse(readFileSync(path, 'utf8'))?.velocity?.work_planner?.min_fit_samples;
    return Number.isInteger(value) && value > 0 ? value : MIN_FIT_SAMPLES;
  } catch {
    return MIN_FIT_SAMPLES;
  }
}

function shippedDefault(track) {
  return SHIPPED_DEFAULTS[track] ?? FALLBACK_DEFAULT;
}

// The per-track envelope, fitted from the archived corpus when there is enough of
// it and borrowed from the shipped table when there is not. `sample_count` is
// reported either way, so an operator one bundle short can see that.
export function envelopeFor({ rootDir, track, minFitSamples } = {}) {
  const threshold = Number.isInteger(minFitSamples) && minFitSamples > 0
    ? minFitSamples
    : configuredMinSamples(rootDir);

  const usable = readCorpus({ rootDir })
    .filter((b) => b.track === track && b.measured && b.applicable);

  const fitted = median(usable.map((b) => b.envelope_tokens));

  if (fitted === null || usable.length < threshold) {
    return {
      track,
      envelope_tokens: shippedDefault(track),
      fitted: false,
      sample_count: usable.length,
      source: 'shipped-default',
    };
  }

  return { track, envelope_tokens: fitted, fitted: true, sample_count: usable.length, source: 'corpus' };
}

// This workflow's own payload, read from the bundles it has already stamped. A track
// with no payload phase is `applicable: false` rather than a zero — scoring a chore
// 0x would report every chore as maximally wasteful (AC-013).
export function measurePayloadFromCorpus({ rootDir, track }) {
  const usable = readCorpus({ rootDir }).filter((b) => b.track === track && b.measured);
  if (usable.length === 0) return { track, payload_tokens: 0, measured: false, applicable: true };

  const applicable = usable.some((b) => b.applicable);
  return {
    track,
    payload_tokens: median(usable.filter((b) => b.applicable).map((b) => b.payload_tokens)) ?? 0,
    measured: true,
    applicable,
  };
}

export { SHIPPED_DEFAULTS, MIN_FIT_SAMPLES };
