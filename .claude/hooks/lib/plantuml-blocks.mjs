// Foundation — plantuml fence extraction and the required-kind match rule.
//
// `spec_diagram_presence_guard` and `/spec-lint` both answer "does this spec carry
// the required diagram kinds", and each carried its own copy of the fence regex
// and the marker/any_of matcher. That is precisely the shape the repo's
// one-rule-one-module convention exists to prevent: the guard and its preflight
// judging the same property from two implementations that can drift.
//
// Content-only and stdlib-only. Resolving an element id against the corpus needs
// the filesystem and stays with each caller, which is also where the two
// legitimately differ — the guard blocks an unresolvable id, the preflight reports
// it.

const FENCE_RE = /^[ \t]*```[ \t]*plantuml[ \t]*$([\s\S]*?)^[ \t]*```[ \t]*$/gim;

// The bodies of every ```plantuml``` fence, in document order.
export function plantumlBlocks(content) {
  return [...String(content ?? '').matchAll(FENCE_RE)].map((m) => m[1]);
}

// One block satisfies a kind when it carries the literal marker OR matches any
// `any_of` pattern. An uncompilable pattern is skipped rather than thrown on: a
// config typo must not brick the write boundary.
export function blockSatisfies(body, rule) {
  if (!rule || typeof rule !== 'object') return false;
  if (rule.marker && String(body).includes(rule.marker)) return true;
  for (const pattern of rule.any_of ?? []) {
    try {
      if (new RegExp(pattern, 'm').test(body)) return true;
    } catch { /* a bad pattern matches nothing */ }
  }
  return false;
}

// Which required kinds the blocks do not cover, with the counts a caller needs to
// report. `min` defaults to 1 and a non-object rule is ignored, matching what both
// callers did before they shared this.
export function missingKinds(blocks, required) {
  const missing = [];
  for (const [kind, rule] of Object.entries(required ?? {})) {
    if (!rule || typeof rule !== 'object') continue;
    const need = Number.isFinite(rule.min) ? Math.trunc(rule.min) : parseInt(rule.min ?? 1, 10) || 1;
    const found = blocks.filter((b) => blockSatisfies(b, rule)).length;
    if (found < need) missing.push({ kind, need, found });
  }
  return missing;
}
