// Domain — the verdict, and the only home of the two numbers.
//
// The floor is 3x and the target is 4x, which in spend terms is an envelope of 25%
// and 20%. Measured over 90 archived bundles the median workflow sits at 1.18x, so
// both bars are a real tightening — history is the baseline to beat, not the target
// to conform to.
//
// Pure on purpose: every threshold boundary is decided here and nowhere else, so a
// caller cannot drift the meaning of "acceptable" by reimplementing the comparison.

const FLOOR = 3;
const TARGET = 4;

export function classify({ envelope, payload }) {
  if (!payload?.applicable) {
    return { state: 'not-applicable', ratio: null, shortfall_tokens: 0, envelope, payload };
  }
  if (!payload.measured || !(envelope?.envelope_tokens > 0)) {
    return { state: 'unfitted', ratio: null, shortfall_tokens: 0, envelope, payload };
  }

  const ratio = Number((payload.payload_tokens / envelope.envelope_tokens).toFixed(2));

  // The shortfall closes to the TARGET, not the floor. The operator is being asked
  // to reach a well-sized batch, not to scrape past the warning.
  const shortfall = Math.max(0, Math.round(TARGET * envelope.envelope_tokens - payload.payload_tokens));

  let state = 'under-floor';
  if (ratio >= TARGET) state = 'optimal';
  else if (ratio >= FLOOR) state = 'acceptable';

  return { state, ratio, shortfall_tokens: shortfall, envelope, payload };
}

export { FLOOR, TARGET };
