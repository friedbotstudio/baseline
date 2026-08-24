// Foundation — write_set-gated diagram profile resolver.
//
// resolveProfile(content, projectGet) inspects a spec body's write_set and the
// project's compression config, returning the diagram set the spec must satisfy:
//   - the full set (artifacts.required_diagrams.spec) when compression is off,
//     the write_set is un-extractable, no profile fully covers it, or anything
//     throws — every uncertain case fails OPEN to today's behavior;
//   - a profile's reduced set when compression is on AND every write_set path is
//     covered by that profile's `when` globs (a single uncovered path — e.g. a
//     src/** file — forces the full set, so architecture always wins).
//
// The glob compiler lives in glob-match.mjs. It was copied here on the premise
// that a hook lib never imports another hook lib — a rule the tree does not
// actually hold (19 such imports predate this file), and the copy is what let
// four of six copies keep the backtracking bug after one was fixed.
//
// globToRegex is re-exported because in-repo callers already import it here.
import { globToRegex, matchesAnyGlob } from './glob-match.mjs';
// The `@ref` grammar lives in its own module — this one only needs to know
// whether a spec's references are malformed, so it imports that one predicate.
import { malformedReferences } from './corpus-reference.mjs';

export { globToRegex };

// The shared primitive under both overlap predicates below: a pattern's
// non-wildcard directory head. Hoisted out of spec/optimize.mjs so the two
// callers rest on one implementation rather than two that can drift.
export function directoryPrefix(pattern) {
  if (typeof pattern !== 'string') return '';
  const cut = pattern.search(/[*?[]/);
  const head = cut === -1 ? pattern : pattern.slice(0, cut);
  const trimmed = head.replace(/[^/]*$/, '');
  return trimmed.replace(/^\.\//, '');
}

// Glob against glob: do two patterns name overlapping surfaces? Bidirectional,
// because neither side is more specific than the other — this is what
// spec/optimize.mjs asks of an element anchor against a spec write_set.
export function patternsOverlap(a, b) {
  const left = directoryPrefix(a);
  const right = directoryPrefix(b);
  if (!left || !right) return false;
  return left.startsWith(right) || right.startsWith(left);
}

// Concrete path against a declared surface: is this file inside it? ONE-directional
// on purpose. Under the bidirectional rule a surface naming the single file
// `.claude/hooks/lib/scoped-memory.mjs` would match every sibling in that
// directory, and the relevance filter would narrow nothing.
export function pathOverlapsWriteSet(path, patterns) {
  if (typeof path !== 'string' || !path || !Array.isArray(patterns) || !patterns.length) return false;
  const strings = patterns.filter((p) => typeof p === 'string' && p);
  if (matchesAnyGlob(path, strings)) return true;
  return strings.some((pattern) => denotesDirectory(pattern) && path.startsWith(directoryPrefix(pattern)));
}

// The prefix fallback exists so a surface can name a bare directory
// (`.claude/hooks/`) without a glob. It must NOT fire for a surface member that
// names one file: `directoryPrefix` would widen that file to its whole
// directory, and every sibling would read as inside the surface.
function denotesDirectory(pattern) {
  return pattern.endsWith('/') || /[*?[]/.test(pattern);
}

// Exported for the same reason REF_WELL_FORMED is shared: a caller holding its
// own copy is a caller that can drift. `spec/optimize.mjs` asks the same question
// this guard asks — which paths does this spec claim to touch — and two parsers
// answering it differently is how a spec passes one check and fails the other.
export function extractWriteSet(content) {
  const paths = new Set();
  for (const line of content.split(/\r?\n/)) {
    // Accept the colon form (`write_set: ...`), the markdown-bold heading
    // (`**Write set**: ...`), and the prose form (`The write_set is ...`) — real
    // specs (and the compression feature's own spec) declare it in prose, which
    // the colon-only regex silently missed, so the reduction never fired.
    const m = /write[_\s]set\*{0,2}\s*(?::|is\s)\s*(.+)$/i.exec(line);
    if (!m) continue;
    for (let tok of m[1].split(/[`,\s|]+/)) {
      tok = tok.trim().replace(/^\*+|\*+$/g, '').trim();
      if (tok && tok.includes('/') && !tok.startsWith('#')) paths.add(tok);
    }
  }
  return [...paths];
}

function coversEntirely(profile, writeSetPaths) {
  return Array.isArray(profile.when)
    && writeSetPaths.every((p) => matchesAnyGlob(p, profile.when));
}

export function resolveProfile(content, projectGet) {
  const fullSet = (reason) => ({
    id: 'full',
    required_diagrams: projectGet('.artifacts.required_diagrams.spec'),
    ...(reason ? { reason } : {}),
  });
  try {
    if (projectGet('.artifacts.compression.enabled') === false) return fullSet();
    const malformed = malformedReferences(content);
    if (malformed.length) {
      return fullSet(`malformed corpus reference: ${malformed.map((t) => t.trim()).join(', ')}`);
    }

    const writeSetPaths = extractWriteSet(content);
    if (writeSetPaths.length === 0) return fullSet();

    // A write_set touching any security-sensitive path always requires the full
    // architectural set — the reduction must never thin documentation for a
    // sensitive surface (CWE-693). Defense-in-depth: fires even if a profile's
    // `when` were to cover a sensitive glob.
    const sensitive = projectGet('.security.sensitive_globs');
    if (Array.isArray(sensitive) && writeSetPaths.some((p) => matchesAnyGlob(p, sensitive))) {
      return fullSet();
    }

    const profiles = projectGet('.artifacts.diagram_profiles');
    if (!Array.isArray(profiles) || profiles.length === 0) return fullSet();

    const match = profiles.find((p) => coversEntirely(p, writeSetPaths) && p.required_diagrams);
    return match
      ? { id: match.id, required_diagrams: match.required_diagrams }
      : fullSet();
  } catch {
    return fullSet();
  }
}
