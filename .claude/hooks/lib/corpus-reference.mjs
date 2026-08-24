// Foundation — the `@ref element:<id>` grammar, content-only.
//
// A spec may satisfy the structural diagram kinds by REFERENCING a corpus element
// instead of redrawing it. Only the SYNTAX is judged here: resolving an id needs
// the corpus on disk, and this module deliberately reads no files. Each caller
// resolves its own ids, which is also where the two callers legitimately differ —
// `spec_diagram_presence_guard` blocks an unresolvable id, `/spec-lint` reports it.
//
// Split out of write-set-profile.mjs, which had grown past the module budget
// carrying two concerns. The recorded convention that put the parse there forbids
// DUPLICATING the rule, not housing it: there is still exactly one
// `REF_WELL_FORMED`, and now both the guard and the preflight import it from the
// module that owns it rather than from the profile resolver that happens to use it.
//
// A malformed reference forces the full diagram set rather than throwing. An author
// who meant to reference something and mistyped it must not get a QUIETER
// requirement than one who referenced nothing at all — that would make a typo the
// cheapest way to thin a spec.
const REF_TOKEN = /@ref\b[^\n`]*/g;

// An INLINE code span is prose about the syntax, never a use of it. Excluding the
// backtick from REF_TOKEN's body stops a token SPANNING a span but not one
// STARTING inside it, so a sentence spelling the token out matched, failed the
// well-formed test on its placeholder, and forced the full diagram set silently.
//
// Fenced blocks are NOT masked. The template presents the declaration slot as a
// fence, so masking them would silently deny the carve-out to every author who
// copies the template and fills in a real id — trading one silent failure for
// another. Masking preserves length so nothing downstream shifts.
function maskInlineCode(content) {
  return String(content).replace(/(`+)(?:(?!\1)[^\n])*?\1/g, (span) => span.replace(/[^\n]/g, ' '));
}

// `<element-id>` is this repo's universal "substitute here" convention, and the
// template's own example uses it. A bracketed id slot names no element, so the
// token is documentation: neither counted as a reference nor reported as a typo.
//
// It opens no hole. Documentation yields NO structural carve-out, so an author who
// writes a placeholder still has to draw the diagrams — the same requirement a
// malformed token produced, reached without the false accusation.
const REF_PLACEHOLDER = /^@ref\s+element:\s*<[^>]*>$/;

// ONE constant, two readers: `malformedReferences` tests it, `elementReferences`
// reads its capture. A second copy of this rule is precisely what let the write
// guard and /spec-lint disagree about the same bytes — the guard carved the
// structural kinds out on a resolvable reference and the preflight never did, so
// every spec-as-diff spec failed its own preflight while passing the boundary.
const REF_WELL_FORMED = /^@ref\s+element:([a-z0-9][a-z0-9-]*)$/;

// The kinds a corpus element stands in for. Shared for the same reason the regex
// is: a caller holding its own copy is a caller that can drift.
export const STRUCTURAL_KINDS = new Set(['c4_context', 'c4_container', 'c4_component']);

export function referenceTokens(content) {
  return (maskInlineCode(content).match(REF_TOKEN) ?? [])
    .filter((token) => !REF_PLACEHOLDER.test(token.trim()));
}

// The offending tokens, not just whether there are any. `resolveProfile` quotes
// them: an author told only "full set required" has no way to find the typo, and
// one who draws every diagram anyway never learns the reduction was refused.
export function malformedReferences(content) {
  return referenceTokens(content).filter((token) => !REF_WELL_FORMED.test(token.trim()));
}

export function hasMalformedReference(content) {
  return malformedReferences(content).length > 0;
}

// Well-formed ids only.
export function elementReferences(content) {
  return referenceTokens(content)
    .map((token) => REF_WELL_FORMED.exec(token.trim()))
    .filter(Boolean)
    .map((match) => match[1]);
}
