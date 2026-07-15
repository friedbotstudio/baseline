// A2 — evidence-shape ladder (roadmap Epic 2). Maps a Governance Class to the
// cumulative set of evidence RUNGS a decision must carry, and checks an
// evidence object for their PRESENCE only.
//
// D3 invariance: the check is presence-based — a rung counts as satisfied when
// its key holds any truthy value. Length, authorship, and duration never affect
// the verdict, so AI-authored evidence is never penalized.

// Cumulative rungs, ascending rigor. Each class adds to the one below it.
const RUNGS_BY_CLASS = {
  D: ['authorize'],
  C: ['authorize', 'understanding'],
  B: ['authorize', 'understanding', 'reasoning'],
  A: ['authorize', 'understanding', 'reasoning', 'alternatives', 'tradeoffs', 'confidence'],
};

function rungsFor(cls) {
  return RUNGS_BY_CLASS[cls] || RUNGS_BY_CLASS.D;
}

// evidenceShapeFor(class) → { class, rungs } — the required cumulative rung set.
export function evidenceShapeFor(cls) {
  return { class: RUNGS_BY_CLASS[cls] ? cls : 'D', rungs: [...rungsFor(cls)] };
}

// A rung is present when its key holds a non-empty value. Booleans, non-empty
// strings, and non-empty arrays/objects all count; empty string / null /
// undefined / empty array do not.
function present(value) {
  if (value === undefined || value === null || value === false) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

// checkEvidenceShape(class, evidence) → { ok, missing } — names each required
// rung the evidence does not carry. Presence-only (D3).
export function checkEvidenceShape(cls, evidence = {}) {
  const required = rungsFor(cls);
  const ev = evidence && typeof evidence === 'object' ? evidence : {};
  const missing = required.filter((rung) => !present(ev[rung]));
  return { ok: missing.length === 0, missing };
}
