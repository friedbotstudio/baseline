// Foundation — threat/value tier dial accessor (v1 piece 2, tier-oracle-floor-dial).
//
// One read path for every checker's floor (quality threshold) and ceiling (effort
// budget). A project.json `tier.level` selects a built-in profile; `tier.overrides`
// tunes per checker. Resilient to a missing/invalid project.json — same contract as
// every other reader (common.mjs → projectGet): returns defaults, never throws.
//
// `mandatory` is resolved DATA this slice; nothing here gates on it — blocking is
// piece 5. See docs/specs/tier-oracle-floor-dial.md.

import { projectGet } from './common.mjs';

export const CANONICAL_CHECKERS = ['brainstorm', 'spec', 'tdd', 'security', 'review', 'ac-conformance', 'spec-rollout', 'code-structure', 'design-judge'];

// Unknown checker → this threshold (advisory, floorless, single round).
export const DEFAULT_THRESHOLD = { floor: null, ceiling: 1, mandatory: false };

const FALLBACK_TIER = 'internal-tool';

// floor units differ per checker: tdd = mutation-score fraction (0..1);
// spec/ac-conformance = 1.0 (100% traced/green); security/review = max-allowed
// findings count (0). ceiling = rounds. mandatory = piece-5 gate data.
export const DEFAULT_PROFILES = {
  'internal-tool': {
    brainstorm: { floor: null, ceiling: 1, mandatory: false },
    spec: { floor: 1.0, ceiling: 1, mandatory: false },
    tdd: { floor: 0.0, ceiling: 2, mandatory: false },
    security: { floor: 0, ceiling: 1, mandatory: false },
    review: { floor: 0, ceiling: 1, mandatory: false },
    'ac-conformance': { floor: 1.0, ceiling: 1, mandatory: true },
    'spec-rollout': { floor: 0, ceiling: 1, mandatory: true },
    'code-structure': { floor: 0, ceiling: 1, mandatory: true },
    'design-judge': { floor: 0, ceiling: 1, mandatory: true },
  },
  'customer-data': {
    brainstorm: { floor: null, ceiling: 1, mandatory: false },
    spec: { floor: 1.0, ceiling: 2, mandatory: true },
    tdd: { floor: 0.70, ceiling: 2, mandatory: false },
    security: { floor: 0, ceiling: 2, mandatory: true },
    review: { floor: 0, ceiling: 1, mandatory: false },
    'ac-conformance': { floor: 1.0, ceiling: 1, mandatory: true },
    'spec-rollout': { floor: 0, ceiling: 2, mandatory: true },
    'code-structure': { floor: 0, ceiling: 1, mandatory: true },
    'design-judge': { floor: 0, ceiling: 2, mandatory: true },
  },
  regulated: {
    brainstorm: { floor: null, ceiling: 2, mandatory: false },
    spec: { floor: 1.0, ceiling: 3, mandatory: true },
    tdd: { floor: 0.85, ceiling: 3, mandatory: true },
    security: { floor: 0, ceiling: 3, mandatory: true },
    review: { floor: 0, ceiling: 2, mandatory: true },
    'ac-conformance': { floor: 1.0, ceiling: 2, mandatory: true },
    'spec-rollout': { floor: 0, ceiling: 3, mandatory: true },
    'code-structure': { floor: 0, ceiling: 2, mandatory: true },
    'design-judge': { floor: 0, ceiling: 2, mandatory: true },
  },
};

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

// Resolve the `tier` block from either an injected projectJson or the live file.
function tierBlock({ projectJson } = {}) {
  if (projectJson !== undefined) {
    return isPlainObject(projectJson) && isPlainObject(projectJson.tier) ? projectJson.tier : {};
  }
  try {
    const live = projectGet('tier');
    return isPlainObject(live) ? live : {};
  } catch {
    return {};
  }
}

function overrideFor(block, checker) {
  return isPlainObject(block.overrides) && isPlainObject(block.overrides[checker])
    ? block.overrides[checker]
    : {};
}

// override value wins when present; otherwise the profile value.
function pick(overrideValue, profileValue) {
  return overrideValue !== undefined
    ? { value: overrideValue, fromOverride: true }
    : { value: profileValue, fromOverride: false };
}

export function readTier(opts = {}) {
  const level = tierBlock(opts).level;
  return typeof level === 'string' && DEFAULT_PROFILES[level] ? level : FALLBACK_TIER;
}

export function resolveCheckerThreshold(checker, opts = {}) {
  const tier = readTier(opts);
  const base = (DEFAULT_PROFILES[tier] || {})[checker];

  if (!base) {
    return { tier, checker, ...DEFAULT_THRESHOLD, source: 'default' };
  }

  const ov = overrideFor(tierBlock(opts), checker);
  const floor = pick(ov.floor, base.floor);
  const ceiling = pick(ov.ceiling, base.ceiling);
  const mandatory = pick(ov.mandatory, base.mandatory);
  const overridden = floor.fromOverride || ceiling.fromOverride || mandatory.fromOverride;

  return {
    tier,
    checker,
    floor: floor.value,
    ceiling: ceiling.value,
    mandatory: mandatory.value,
    source: overridden ? 'override' : 'profile',
  };
}

export function resolveAllCheckers(opts = {}) {
  const out = {};
  for (const checker of CANONICAL_CHECKERS) {
    out[checker] = resolveCheckerThreshold(checker, opts);
  }
  return out;
}

// --- Governance Class (A1, roadmap Epic 2) ---------------------------------
//
// A change's Governance Class ∈ {D,C,B,A} (ascending rigor: index 0 = D lowest,
// 3 = A highest). The FLOOR is derived mechanically from blast-radius signals
// combined with the project tier — "the tier dial IS this floor" (Ledger #0002
// D8), so this extends the same read path rather than adding a parallel
// classifier. Raise-only: discretion may lift a change above its floor, never
// below it. Consumed by /triage Step 0 (writes workflow.json → governance_class),
// the evidence-shape ladder (A2), and resolveSkipBrainstorm (A5).

export const GOVERNANCE_CLASSES = ['D', 'C', 'B', 'A'];

// Per-tier minimum class floor. Same three tiers as DEFAULT_PROFILES.
const TIER_CLASS_FLOOR = { 'internal-tool': 'D', 'customer-data': 'C', regulated: 'B' };

// The higher-rigor of two classes; tolerant of an unknown input.
function higherClass(a, b) {
  const ia = GOVERNANCE_CLASSES.indexOf(a);
  const ib = GOVERNANCE_CLASSES.indexOf(b);
  if (ia < 0) return GOVERNANCE_CLASSES.includes(b) ? b : 'D';
  if (ib < 0) return a;
  return ia >= ib ? a : b;
}

// raiseClass(floor, requested) → the higher rigor of the two; NEVER below floor.
// An invalid/absent requested class leaves the floor unchanged.
export function raiseClass(floor, requested) {
  const base = GOVERNANCE_CLASSES.includes(floor) ? floor : 'D';
  return higherClass(base, requested);
}

// classFloor(signals, opts) → { class, floor, tier, signals, source:'floor' }.
// Deterministic and resilient — a missing/invalid project.json degrades to the
// tier fallback (internal-tool) without throwing, same contract as
// resolveCheckerThreshold.
export function classFloor(signals = {}, opts = {}) {
  const tier = readTier(opts);
  let floor = higherClass('D', TIER_CLASS_FLOOR[tier] || 'D');
  if (signals && signals.hookOrGovernance) floor = higherClass(floor, 'C');
  if (signals && signals.sensitiveSurface) floor = higherClass(floor, 'B');
  if (signals && signals.consentAdjacent) floor = higherClass(floor, 'A');
  // Blast-radius bump: a wide change (spans > 1 layer or touches > 5 files)
  // lifts one rung, capped at A.
  const wide = (Number(signals && signals.layerSpan) || 0) > 1
    || (Number(signals && signals.fileCount) || 0) > 5;
  if (wide) {
    const idx = GOVERNANCE_CLASSES.indexOf(floor);
    floor = GOVERNANCE_CLASSES[Math.min(idx + 1, GOVERNANCE_CLASSES.length - 1)];
  }
  return { class: floor, floor, tier, signals: signals || {}, source: 'floor' };
}
