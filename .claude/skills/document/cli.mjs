// Orchestration — the front door to the document phase's helpers.
//
// Two subcommands over the two modules document/SKILL.md invoked inline. `receipt`
// WRITES, so it runs through the same W-1..W-5 contract the corpus writers do
// (spec dispatcher-sweep): its slug is validated before any path is built, it
// refuses a bulk form, and it reports whether it actually recorded anything rather
// than exiting 0 either way.
//
// `document-gate.mjs` keeps its own front door too (the harness invokes it
// directly, not through a SOP procedure) — `gate` below is an added caller, not a
// moved one, per the read-front-door sweep (§Behavior #5).

import { dispatch, lines, requireValue, refuseBulk, UsageError } from '../lib/argv.mjs';
import { assertNoTraversal } from '../workspace/tree.mjs';
import { assertSafeSlug } from '../../hooks/lib/slug.mjs';
import { recordReceipt, readReceipts } from './receipts.mjs';
import { findDescribedSurfaces } from './public-site-reflect.mjs';
import { runGate } from './document-gate.mjs';

function changedPaths(flags) {
  const raw = flags.touched;
  if (raw === undefined || raw === true) return [];
  return String(raw).split(',').map((p) => p.trim()).filter(Boolean).map((p) => assertNoTraversal(p));
}

function receipt({ flags, positional, root }) {
  refuseBulk(flags, positional, { max: 0 });
  const slug = requireValue(flags, 'slug');
  const surface = requireValue(flags, 'surface');
  const delegate = requireValue(flags, 'delegate');

  // Idempotent per (surface, delegate) in the Domain module, so `recorded: false`
  // is a real answer — a re-run of the same document tick, not a failure. The text
  // says which happened; collapsing both to exit 0 with no words would make a
  // no-op indistinguishable from a write, the same defect W-2 guards against.
  const result = recordReceipt({ slug, surface, delegate, rootDir: root });
  return {
    data: { ...result, slug, surface, delegate },
    text: lines([`${result.recorded ? 'recorded' : 'already present'}  ${surface} -> ${delegate}  (${result.receipts} total)`]),
  };
}

function surfaces({ flags, root }) {
  const paths = changedPaths(flags);
  if (paths.length === 0) {
    // findDescribedSurfaces returns [] for an empty token set, which is
    // indistinguishable from "nothing matched". The caller passes a diff; an empty
    // diff is a caller mistake worth naming, not a clean result.
    throw new UsageError('surfaces needs --touched <comma-separated changed paths>');
  }
  const found = findDescribedSurfaces({ changedPaths: paths, root });
  return {
    data: found,
    text: lines(found.length ? found.map((s) => (typeof s === 'string' ? s : JSON.stringify(s))) : ['(no described surface reflects these paths)']),
  };
}

// `--touched` omitted means "derive from git", matching document-gate.mjs's own
// direct-path default (`--paths` omitted). An explicit but empty `--touched`
// resolves to an empty array rather than `undefined`, so it means "nothing
// changed" here — a caller that wants git-derived paths simply omits the flag.
function gate({ flags, root }) {
  const slug = requireValue(flags, 'slug');
  assertSafeSlug(slug, 'document gate');
  const raw = flags.touched;
  const paths = raw === undefined || raw === true
    ? undefined
    : String(raw).split(',').map((p) => p.trim()).filter(Boolean).map((p) => assertNoTraversal(p));

  const result = runGate({ slug, paths, rootDir: root });
  return {
    data: result,
    text: lines(result.ok
      ? [`document-gate: ${result.required.length} surface(s) checked — CLEAN`]
      : [
        'document-gate: BLOCKED — required delegate(s) left no receipt',
        ...result.missing.map((gap) => `  ${gap.surface}  ->  missing: ${gap.delegate}`),
      ]),
  };
}

function receipts({ flags, root }) {
  const slug = requireValue(flags, 'slug');
  const state = readReceipts({ slug, rootDir: root });
  return {
    data: state,
    text: lines(state.receipts.length
      ? state.receipts.map((r) => `${r.surface} -> ${r.delegate}`)
      : ['(no receipts recorded)']),
  };
}

dispatch({
  name: 'document',
  subcommands: {
    receipt: { summary: 'record a delegate receipt for a documented surface (writes)', run: receipt },
    receipts: { summary: 'the receipts recorded so far for a slug', run: receipts },
    surfaces: { summary: 'described site surfaces reflecting --touched paths', run: surfaces },
    gate: { summary: 'required and missing delegates for a slug, and whether the gate passes', run: gate },
  },
});
