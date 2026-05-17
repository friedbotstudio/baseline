// Conventional-commit type → keepachangelog 1.0.0 section.
//
// Default mapping (overridable per-commit in the actuator):
//   feat       → Added
//   fix        → Fixed
//   perf       → Changed
//   refactor   → Changed
//   docs       → (no entry; release-time CHANGELOG ignores)
//   style      → (no entry)
//   test       → (no entry)
//   build      → (no entry)
//   ci         → (no entry)
//   chore      → (no entry)
//   revert     → Removed
// Breaking suffix (`feat!:` or `BREAKING CHANGE:` body) → forces Changed
// section regardless of base type AND sets breaking: true on the entry.

const TYPE_TO_SECTION = Object.freeze({
  feat: 'Added',
  fix: 'Fixed',
  perf: 'Changed',
  refactor: 'Changed',
  revert: 'Removed',
});

const SKIP_TYPES = new Set(['docs', 'style', 'test', 'build', 'ci', 'chore']);

export function classify(commit) {
  if (!commit || typeof commit !== 'object') return null;
  const type = (commit.type || '').toLowerCase();
  const breaking = Boolean(commit.breaking);
  if (SKIP_TYPES.has(type) && !breaking) return null;
  if (breaking) {
    return { section: 'Changed', breaking: true };
  }
  const section = TYPE_TO_SECTION[type];
  if (!section) return null;
  return { section, breaking: false };
}

// All six keepachangelog 1.0.0 sections, in canonical order.
export const KEEPACHANGELOG_SECTIONS = Object.freeze([
  'Added',
  'Changed',
  'Deprecated',
  'Removed',
  'Fixed',
  'Security',
]);
