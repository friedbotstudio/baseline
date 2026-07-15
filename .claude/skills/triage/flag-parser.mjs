// Foundation — /triage field handling. parseFlags (AC-010) detects
// --no-brainstorm and --codesign substrings in the request string, sets the
// corresponding workflow.json fields, and returns the request with flags
// stripped. Flags are independent — both may appear.
// validateNoveltyRecord + resolveSkipBrainstorm (erp-portables slice DEF,
// AC-004/AC-005) are the build-to-spec doctrine helpers: Step 0 novelty
// classification validation and the explicit skip_brainstorm derivation.

const NO_BRAINSTORM_RE = /--no-brainstorm\b/g;
const CODESIGN_RE = /--codesign\b/g;

export const NOVELTY_VALUES = ['pattern-copy', 'spec-derived', 'novel', 'ambiguous'];

const isNamed = (v) => typeof v === 'string' && v.trim().length > 0;

export function validateNoveltyRecord({ novelty, novelty_evidence, track_id, leanest_track_id, track_reason } = {}) {
  if (!NOVELTY_VALUES.includes(novelty)) {
    return { valid: false, reason: `novelty must be one of ${NOVELTY_VALUES.join('|')}; got ${JSON.stringify(novelty)}` };
  }
  if (!isNamed(novelty_evidence)) {
    return { valid: false, reason: 'novelty_evidence must cite the evidence for the classification (non-empty string)' };
  }
  if (track_id !== leanest_track_id && !isNamed(track_reason)) {
    return { valid: false, reason: `track ${JSON.stringify(track_id)} is heavier than leanest ${JSON.stringify(leanest_track_id)}; a named track_reason is required` };
  }
  return { valid: true, reason: null };
}

export function resolveSkipBrainstorm({ novelty, complete_framing, no_brainstorm_flag, governanceClass } = {}) {
  // A5 (roadmap Epic 2) — the Governance Class is a hard floor on rigor. Class A
  // and B can NEVER skip brainstorm, and that floor overrides even an explicit
  // --no-brainstorm (mirrors A1's raise-only rule: a convenience flag cannot
  // lower a top-class change below its floor). Checked FIRST so nothing beneath
  // it can re-enable the skip.
  if (governanceClass === 'A' || governanceClass === 'B') return false;
  if (no_brainstorm_flag === true) return true;
  // Class D always skips; Class C / undefined fall through to novelty (unchanged).
  if (governanceClass === 'D') return true;
  if (novelty === 'spec-derived' || novelty === 'pattern-copy') return true;
  if (novelty === 'novel') return complete_framing === true;
  return false;
}

export function parseFlags(request) {
  if (typeof request !== 'string') {
    return { skip_brainstorm: false, codesign_mode: false, cleaned_request: '' };
  }
  const skip_brainstorm = /--no-brainstorm\b/.test(request);
  const codesign_mode = /--codesign\b/.test(request);

  const cleaned = request
    .replace(NO_BRAINSTORM_RE, '')
    .replace(CODESIGN_RE, '')
    .replace(/\s+/g, ' ')
    .trim();

  return { skip_brainstorm, codesign_mode, cleaned_request: cleaned };
}
