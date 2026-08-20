// Domain — predict a workflow's payload before it exists.
//
// The forward estimate exists so the batching decision can be made at triage, before
// the expensive discovery phases run — which is where the worst measured ratios are
// (`intake-full` at 0.66x). It will be wrong early and there is no way to make it
// right without history, so it reports a floor rather than a confident number and
// the triage checkpoint that reads it is advisory even by the standards of an
// advisory floor.
//
// Structural, not nearest-neighbour: the research memo's Candidate C is strictly
// better once a corpus exists and strictly worse at the point every new operator
// starts, and a fresh install is a hard constraint. The interface is the same shape
// C would need, so swapping the body later changes no caller.

// Per-track payload floors, fitted from this repository's measured bundles on
// 2026-08-20. A track absent here falls back to the pooled figure.
const TRACK_BASELINE = Object.freeze({
  'intake-full': 18000,
  'spec-entry': 20000,
  'tdd-quickfix': 27000,
  'epic-child': 32000,
  'epic': 14000,
  'power': 25000,
});
const POOLED_BASELINE = 20000;

// Each unit of declared scope is worth roughly this much payload. Deliberately
// coarse: a precise-looking coefficient over 90 samples would imply a confidence the
// back-test does not support.
const PER_AC = 900;
const PER_WRITE_PATH = 1400;
const PER_COMPONENT = 2600;

const count = (value) => (Number.isFinite(value) && value > 0 ? value : 0);

// A descriptor may be almost empty — triage often knows the track and little else —
// so every term degrades to zero and the track baseline carries the estimate alone.
export function estimatePayload(descriptor = {}) {
  const { track, ac_count, write_surface_count, component_count } = descriptor ?? {};
  const base = TRACK_BASELINE[track] ?? POOLED_BASELINE;

  return base
    + count(ac_count) * PER_AC
    + count(write_surface_count) * PER_WRITE_PATH
    + count(component_count) * PER_COMPONENT;
}

// What triage reports: the predicted ratio against the fitted envelope, plus the
// confidence caveat that keeps a borrowed envelope from reading as a measurement.
export function projectRatio({ estimate, envelope }) {
  if (!envelope || !(envelope.envelope_tokens > 0)) return { ratio: null, confident: false };
  return {
    ratio: Number((estimate / envelope.envelope_tokens).toFixed(2)),
    confident: envelope.fitted === true,
  };
}

export { TRACK_BASELINE, POOLED_BASELINE };
