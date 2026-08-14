// Foundation — the one glob-to-RegExp compiler. Imports nothing but its own
// arguments, so every guard and skill can rest on it without a cycle.
//
// Three dialects existed as six copies before this module (spec
// globtoregex-shared-module-hoist). They are preserved here as options rather
// than merged, because two of the callers compile consent-relevant config:
// `common.mjs` reads `git.protected_branches`, and widening what it matches
// changes which branches demand a commit grant.
//
// Two mechanisms, and only one of them is a performance defense. Measured
// 2026-08-15 against a 120-character path: one 60-star run costs 130,804 ms
// emitted per-pair and 0.0 ms collapsed, so the collapse cures that shape
// outright. But six runs separated by literals still cost 45,952 ms AFTER
// collapsing — `^.*x.*x.*x.*x.*x.*xb$` is exponential however each run was
// emitted. MAX_UNBOUNDED_SEGMENTS is what stops that, and it is the only bound
// this compiler enforces.

// A star run longer than this is not something a human typed, so the *declaration*
// boundary drops the member (write-surface.mjs). It is NOT enforced here: the
// compiler collapses any run to one `.*`, which is both cheap and what callers
// already assert. Exported so one definition serves every caller.
export const MAX_STAR_RUN = 3;

// This many `.*` groups or more is refused at compile time. Real config peaks at
// 2 (`**/auth/**`); four groups measure 96 ms, six measure 45,952 ms.
export const MAX_UNBOUNDED_SEGMENTS = 5;

const ESCAPED_ALWAYS = '.+()|^$\\{}';
const ESCAPED_WITHOUT_CHAR_CLASS = '[]';

function refuse(glob, detail) {
  throw new RangeError(`glob-match: refusing ${JSON.stringify(glob)} — ${detail}`);
}

function starRunLength(glob, start) {
  let end = start;
  while (glob[end + 1] === '*') end += 1;
  return end - start + 1;
}

// A character class is only opened when the caller asked for one AND the class
// terminates. An unterminated `[` is a literal in every dialect, which is what
// keeps `release-[0-9` compiling instead of throwing a SyntaxError.
function closingBracket(glob, open) {
  let i = open + 1;
  while (i < glob.length && glob[i] !== ']') i += 1;
  return i < glob.length ? i : -1;
}

export function globToRegex(glob, options = {}) {
  if (typeof glob !== 'string') {
    throw new TypeError(`glob-match: expected a string glob, received ${typeof glob}`);
  }
  const segmentGlobstar = options?.segmentGlobstar === true;
  const charClass = options?.charClass === true;
  const escaped = charClass ? ESCAPED_ALWAYS : ESCAPED_ALWAYS + ESCAPED_WITHOUT_CHAR_CLASS;

  let pattern = '';
  let unboundedSegments = 0;

  for (let i = 0; i < glob.length; i += 1) {
    const c = glob[i];

    if (c === '*') {
      const run = starRunLength(glob, i);
      i += run - 1;

      if (run === 1) {
        pattern += '[^/]*';
        continue;
      }

      unboundedSegments += 1;
      if (unboundedSegments >= MAX_UNBOUNDED_SEGMENTS) {
        refuse(
          glob,
          `${unboundedSegments} unbounded segments reach MAX_UNBOUNDED_SEGMENTS (${MAX_UNBOUNDED_SEGMENTS})`,
        );
      }
      // `**/` matches zero or more leading path segments, so `**/*.md` matches a
      // top-level README.md. Only rightsize-gate asked for this; the default
      // leaves `**/` as `.*/`, which requires at least one segment.
      if (segmentGlobstar && glob[i + 1] === '/') {
        pattern += '(?:.*/)?';
        i += 1;
      } else {
        pattern += '.*';
      }
      continue;
    }

    if (c === '?') {
      pattern += '[^/]';
      continue;
    }

    if (c === '[' && charClass) {
      const close = closingBracket(glob, i);
      if (close === -1) {
        pattern += '\\[';
        continue;
      }
      pattern += glob.slice(i, close + 1);
      i = close;
      continue;
    }

    pattern += escaped.includes(c) ? `\\${c}` : c;
  }

  return new RegExp(`^${pattern}$`);
}

export function expandBraces(globs) {
  const out = [];
  for (const g of globs) {
    const open = g.indexOf('{');
    const close = g.indexOf('}', open + 1);
    if (open === -1 || close === -1) {
      out.push(g);
      continue;
    }
    const prefix = g.slice(0, open);
    const suffix = g.slice(close + 1);
    for (const alt of g.slice(open + 1, close).split(',')) out.push(prefix + alt.trim() + suffix);
  }
  return out;
}

// A RangeError from a member propagates rather than reading as "no match".
// Swallowing it would restore the silent hang the bounds exist to remove.
export function matchesAnyGlob(path, globs, options = {}) {
  if (!Array.isArray(globs)) return false;
  for (const g of expandBraces(globs)) {
    if (typeof g !== 'string' || g === '') continue;
    if (globToRegex(g, options).test(path)) return true;
  }
  return false;
}
