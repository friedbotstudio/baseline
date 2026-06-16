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

export const CANONICAL_CHECKERS = ['brainstorm', 'spec', 'tdd', 'security', 'review', 'ac-conformance'];

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
  },
  'customer-data': {
    brainstorm: { floor: null, ceiling: 1, mandatory: false },
    spec: { floor: 1.0, ceiling: 2, mandatory: true },
    tdd: { floor: 0.70, ceiling: 2, mandatory: false },
    security: { floor: 0, ceiling: 2, mandatory: true },
    review: { floor: 0, ceiling: 1, mandatory: false },
    'ac-conformance': { floor: 1.0, ceiling: 1, mandatory: true },
  },
  regulated: {
    brainstorm: { floor: null, ceiling: 2, mandatory: false },
    spec: { floor: 1.0, ceiling: 3, mandatory: true },
    tdd: { floor: 0.85, ceiling: 3, mandatory: true },
    security: { floor: 0, ceiling: 3, mandatory: true },
    review: { floor: 0, ceiling: 2, mandatory: true },
    'ac-conformance': { floor: 1.0, ceiling: 2, mandatory: true },
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
