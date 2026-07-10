// Foundation — v1 predicate vocabulary for workflows.jsonl Track preconditions
// and selector-node alternate preconditions. The set is closed; unknown
// predicates fail Article IV invariant I11 at validate time. Adding a new
// predicate is a constitutional change (seed.md §18.4 + this module + the
// CLAUDE.md Article IV track list). The JSON Schema's `Predicate.name` enum is
// a fourth, DECLARATIVE gate: no schema engine runs at validate time, so the
// name check below and `validatePredicateParams` are the enforcing pair.
//
// This module is stdlib-free and self-contained by contract: it is copied
// verbatim into `.claude/skills/triage/` by build-template.sh Stage 0b, where
// no sibling of `src/cli/` exists. Never import across trees from here.

export const V1_PREDICATES = Object.freeze(
  new Set([
    'requires_git',
    'requires_user_override',
    'requires_min_components',
    'requires_phase_completed',
    'requires_skill_present',
    'requires_commit_consent',
    'requires_config_flag',
  ])
);

const CONFIG_FLAG = 'requires_config_flag';

export function isKnownPredicate(name) {
  return V1_PREDICATES.has(name);
}

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isScalar(value) {
  return value === null || ['string', 'number', 'boolean'].includes(typeof value);
}

// Returns the reason a predicate declaration is malformed, or null when it is
// well-formed. Reason strings carry no Track context — the caller (I11) owns
// that and wraps this into its named-error shape.
export function validatePredicateParams(pred) {
  if (!isPlainObject(pred)) return 'predicate must be an object';
  if (pred.name !== CONFIG_FLAG) return null;

  if (typeof pred.path !== 'string' || pred.path.length === 0) {
    return `'${CONFIG_FLAG}' requires a non-empty string 'path' (a dot-path into project.json)`;
  }
  if (!Object.hasOwn(pred, 'equals')) {
    return `'${CONFIG_FLAG}' requires an 'equals' value to compare against`;
  }
  if (!isScalar(pred.equals)) {
    return `'${CONFIG_FLAG}' requires 'equals' to be a string, number, boolean, or null`;
  }
  return null;
}

// Resolves a dot-path against a parsed project.json and compares it STRICTLY to
// `params.equals`. Pure and total: every malformed input resolves false rather
// than throwing, so an undiscoverable or misconfigured feature stays OFF.
export function resolveConfigFlag(projectJson, params) {
  if (!isPlainObject(projectJson)) return false;
  if (!isPlainObject(params)) return false;
  if (typeof params.path !== 'string' || params.path.length === 0) return false;
  if (!Object.hasOwn(params, 'equals')) return false;

  let cursor = projectJson;
  for (const segment of params.path.split('.')) {
    if (!isPlainObject(cursor)) return false;
    cursor = cursor[segment];
  }
  return cursor === params.equals;
}
