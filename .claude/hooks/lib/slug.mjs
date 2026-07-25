// slug.mjs — Foundation: the single slug predicate for every path built from a slug.
//
// Hoisted (roadmap T2, backlog -9f4f) once the third caller appeared. Before this
// module the shape `/^[a-z0-9][a-z0-9-]*$/` was redeclared in FIVE places, each
// drifting independently; the length bound (T1) existed in only one of them.
//
// REJECT, never repair (CWE-22). Normalizing a hostile slug — the way the slug
// normalizer in common.mjs strips path segments — would MASK a traversal and silently
// redirect a write somewhere the caller never asked for. That normalizer exists for
// display and marker derivation; it is never the validator. Do not "consolidate" the
// two: they answer different questions. tests/slug-guard-hoist.test.mjs enforces the
// separation with a source scan, so this module names no symbol from it.
//
// What is shared here is the PREDICATE, not the failure mode. Callers sit at
// different layers and owe their callers different failures — a path guard throws,
// a CLI writes stderr and exits, a fail-open checker degrades to an empty result.
// Each imports what it needs and chooses how to fail.

export const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;

// NAME_MAX is 255 bytes on the common filesystems and slug-derived filenames carry
// a suffix (`<slug>.json`, `<slug>.jsonl`, `<slug>.approval`); 200 leaves headroom
// while staying a sane workflow-slug length. Bounding before any path is built turns
// a raw ENAMETOOLONG syscall crash into a named, caller-legible error.
export const MAX_SLUG_LEN = 200;

// Pure predicate. Never throws, never repairs, safe on any input including non-strings.
export function isSafeSlug(slug) {
  return typeof slug === 'string'
    && slug.length <= MAX_SLUG_LEN
    && SLUG_RE.test(slug);
}

// Throwing form for callers that build a path and must fail loudly before doing so.
// `label` names the calling module in the error so a thrown guard is traceable to
// its site without a stack read.
export function assertSafeSlug(slug, label = 'slug') {
  if (typeof slug !== 'string' || !SLUG_RE.test(slug)) {
    throw new Error(
      `${label}: refusing to build a path from an unsafe slug ${JSON.stringify(slug)} `
      + `(must match ${SLUG_RE})`,
    );
  }
  if (slug.length > MAX_SLUG_LEN) {
    throw new Error(
      `${label}: refusing to build a path from an over-long slug `
      + `(length ${slug.length} > ${MAX_SLUG_LEN})`,
    );
  }
  return slug;
}
