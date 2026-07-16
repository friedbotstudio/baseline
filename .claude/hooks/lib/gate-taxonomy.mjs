// gate-taxonomy.mjs — C6, the deliberately-coarse "safe vs ask-a-human" classifier.
// Pure Foundation module: maps an operation descriptor to a verdict grounded in the
// four Article XI.12 categories (CONSTITUTION.md §5.12). Advisory-only — no runtime
// caller wires it into enforcement this slice; the existing consent gates and guards
// are unchanged. Verdict shape mirrors hooks/lib/consent-decision.mjs's {allow,...}.

const CONSENT_ADJACENT = 'consent-adjacent-scope';
const IRREVERSIBLE = 'irreversible-destructive';
const POLICY_FLIP = 'policy-flip';
const CONTRADICTORY = 'contradictory-requirements';

export const CATEGORIES = Object.freeze([
  CONSENT_ADJACENT,
  IRREVERSIBLE,
  POLICY_FLIP,
  CONTRADICTORY,
]);

const ask = (category, reason) => ({ verdict: 'ask', category, reason });
const safe = (reason) => ({ verdict: 'safe', category: null, reason });

// kind -> (meta) -> verdict. `meta` flags (destructive, onProtectedBranch,
// matchedPattern) are caller-supplied — the caller derives them by reusing the
// existing guards, so this module never re-parses a raw command (no regex drift).
const OP_KIND_RULES = Object.freeze({
  'git-op': (meta) => {
    if (meta.destructive) return ask(IRREVERSIBLE, 'git-op flagged destructive (history rewrite / reset --hard / force-push / clean -f)');
    if (meta.onProtectedBranch) return ask(CONSENT_ADJACENT, 'git-op on a protected branch needs commit/push consent');
    return safe('git-op is non-destructive and off a protected branch');
  },
  'destructive-bash': (meta) => {
    if (meta.matchedPattern) return ask(IRREVERSIBLE, 'destructive-bash matched a hard-block/ask pattern');
    return safe('bash command matched no destructive pattern');
  },
  'consent-token-write': () => ask(CONSENT_ADJACENT, 'writing a consent token is a human-only consent act'),
  'phase-skip': () => ask(CONSENT_ADJACENT, 'a phase-skip widens what proceeds without a gate'),
  'spec-widen': () => ask(CONSENT_ADJACENT, "expanding a spec's write surface widens consent scope"),
  'config-flip': () => ask(POLICY_FLIP, 'editing a constitution/project.json-declared default is a policy flip'),
  'requirement-conflict': () => ask(CONTRADICTORY, 'proceeding past a detected requirement contradiction'),
});

// Total function: any unrecognized or malformed input resolves to `ask` (fail-safe).
// Never throws, never mutates the input.
export function classifyOperation(op) {
  const kind = op && typeof op === 'object' ? op.kind : undefined;
  // Own-property only: a `kind` colliding with an Object.prototype member
  // (constructor, toString, __proto__, ...) is an unknown kind, not a rule.
  const rule = kind && Object.hasOwn(OP_KIND_RULES, kind) ? OP_KIND_RULES[kind] : undefined;
  if (!rule) {
    return ask(null, `unknown operation kind '${kind ?? ''}' — fail-safe ask`);
  }
  const meta = (op && op.meta) || {};
  return rule(meta);
}

// Advisory map (test-only this slice): each live consent point resolves to one
// category, proving the taxonomy spans the real enforcement surface without
// changing any enforcement.
export const CONSENT_POINT_MAP = Object.freeze({
  direction_approval_guard: CONSENT_ADJACENT,
  swarm_approval_guard: CONSENT_ADJACENT,
  'git_commit_guard.commit_consent': CONSENT_ADJACENT,
  'git_commit_guard.push_consent': CONSENT_ADJACENT,
  'git_commit_guard.FORBIDDEN_RE': IRREVERSIBLE,
  destructive_cmd_guard: IRREVERSIBLE,
  epic_approval_guard: CONSENT_ADJACENT,
  gitignore_leak_guard: CONSENT_ADJACENT,
  branch_guard: POLICY_FLIP,
});
