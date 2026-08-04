// Foundation — the single source of the canonical memory categories and the
// decay classes that apply to them (spec decision B2).
//
// Before this module the list was hardcoded in EIGHT places. Adding a category
// meant eight coordinated edits, and missing one was a SILENT failure: the reader
// that kept a 7-item copy simply skipped the new category and returned nothing,
// with no error anywhere. `memory-shape.mjs` was the only loud one, and only
// because it compares a count.
//
// Decay is a per-category property, not a global one, so it lives here too:
//
//   STALE_EXEMPT         — never decays. `backlog` holds intent, and intent does
//                          not verify against code, so age says nothing about it.
//   SUPERSESSION_DRIVEN  — never decays BY AGE. A decision is immutable and
//                          expires by being superseded; `superseded-at:` is the
//                          real signal and elapsed commits are noise. This is what
//                          made 26 of 30 live decisions read stale.
//
// The two sets are deliberately SEPARATE (spec decision B4). They happen to have
// the same effect on the predicate today, but they encode different reasons, and
// collapsing them would erase both. `constraints` is in NEITHER (decision B3): a
// constraint is mutable and re-verifiable, so `state_verified_at:` is exactly the
// thing that must be re-checked and age decay is the correct pressure on it.

export const CANONICAL = Object.freeze([
  'landmarks',
  'libraries',
  'decisions',
  'landmines',
  'conventions',
  'pending-questions',
  'backlog',
  'constraints',
]);

export const PENDING_FILE = 'pending-questions';

export const STALE_EXEMPT = new Set(['backlog']);

export const SUPERSESSION_DRIVEN = new Set(['decisions']);

// `load_bearing:` is optional and absent reads as incidental — never undefined.
// Frontmatter arrives as strings from the parser and as real booleans from a
// literal, so both shapes resolve here rather than at each call site.
export function readLoadBearing(fields) {
  const raw = fields && fields.load_bearing;
  if (typeof raw === 'boolean') return raw;
  return String(raw).trim().toLowerCase() === 'true';
}

// The closure field is register-specific: pending-questions resolve, everything
// else is superseded. Encoded here so no reader re-derives it.
export function closureFieldFor(category) {
  return category === PENDING_FILE ? 'resolved-at' : 'superseded-at';
}

// Multi-value frontmatter round-trips through a comma-joined string (the shard
// writer joins arrays that way), so `asArray` alone yields one glued element.
// Splitting here keeps every list-valued field — governs:, rests_on: — reading
// the same way across the surfacing, index and constraint legs.
export function asList(value) {
  if (Array.isArray(value)) return value.map((v) => String(v).trim()).filter(Boolean);
  if (value === undefined || value === null) return [];
  return String(value).split(',').map((v) => v.trim()).filter(Boolean);
}
