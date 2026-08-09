// Orchestration — the front door to the memory-index helpers.
//
// `assert-writable` reports the refusal REASON rather than a bare boolean. An
// unreachable entry and a malformed one both fail, and a caller that cannot tell
// them apart fixes the wrong thing.

import { isAbsolute, join } from 'node:path';

import { dispatch, lines, requireValue } from '../lib/argv.mjs';
import { assertNoTraversal } from '../workspace/tree.mjs';
import { writeConstraint } from './constraints.mjs';
import { assertWritable, isReachable, resolveLookup, SCOPE_PLACEHOLDER } from './resolve.mjs';
import { proposeNarrowing } from './scope-narrow.mjs';
import { CANONICAL, asList } from './categories.mjs';
import { resolveCategory } from './lift-fields.mjs';

const STATES = { true: true, false: false };

// The four kinds `resolveLookup` actually recognizes (its own private
// `LOOKUP_KINDS`, read off the source rather than trusted from the spec's
// sequence diagram — that diagram names only three and predates `by_concept`,
// the architecture-map layer's reverse lookup). `resolve.mjs` doesn't export its
// set, so this is the one piece of vocabulary this dispatcher must hold itself
// to name the legal kinds in a usage error; the LOOKUP itself is never
// reimplemented — every kind is resolved by calling `resolveLookup` (AC-014).
const QUERY_KINDS = ['by_path', 'by_constraint', 'by_element', 'by_concept'];

function memDir({ flags, root }) {
  return flags['mem-dir'] ?? join(root, '.claude/memory');
}

function parseEntry(raw) {
  if (!raw) throw new Error('assert-writable needs a JSON entry object');
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`assert-writable: entry must be valid JSON — ${error.message}`);
  }
}

function assertEntryWritable(ctx) {
  const entry = parseEntry(ctx.positional[0]);
  assertWritable(entry);
  return {
    data: { writable: true, reachable: isReachable(entry) },
    text: lines(['writable: yes', `reachable: ${isReachable(entry)}`]),
  };
}

function constraint(ctx) {
  const { key, state, governs } = ctx.flags;
  if (!key) throw new Error('constraint needs --key');
  if (!(String(state) in STATES)) {
    throw new Error(`constraint: --state must be true or false; got ${JSON.stringify(state)}`);
  }
  if (!governs) throw new Error('constraint needs --governs');
  const written = writeConstraint(memDir(ctx), key, {
    state: STATES[String(state)],
    state_verified_at: ctx.flags['verified-at'] ?? 'unverified',
    governs,
  });
  return { data: { key, written }, text: lines([`wrote constraint ${key}`]) };
}

// AC-009, AC-011, AC-012, AC-014. `--kind` names one of the four kinds
// `resolveLookup` resolves; the lookup itself is entirely delegated — this
// handler validates the flags and forwards, nothing more.
// --spec-dir is caller input and reaches a directory read through conceptLayer(),
// so it is validated exactly as memory-sync/cli.mjs validates the same flag.
// Security review 2026-08-09 F-1 (CWE-22) found this dispatcher forwarding it raw
// while its sibling guarded it — the failure that sibling's comment predicts.
// REJECT, never normalize: resolving the path would mask the traversal.
function corpusDir({ flags }) {
  const given = flags['spec-dir'];
  if (!given) return undefined;
  if (isAbsolute(given)) return given;
  assertNoTraversal(given);
  return given;
}

// `resolveLookup` is polymorphic three ways: an ARRAY for by_constraint/by_element,
// an OBJECT {elements, concepts} for by_path/by_concept, and an ARRAY again for
// those two when no corpus layer resolves. That is resolve.mjs's business; it is
// not a contract to pass on to a caller. Normalizing here is what lets the JSON
// body promise one shape — `entries` always an array, `concepts` always an array —
// so a consumer never branches on which kind it asked for.
function normalizeLookup(result) {
  if (Array.isArray(result)) return { entries: result, concepts: [] };
  return { entries: result?.elements ?? [], concepts: result?.concepts ?? [] };
}

function query(ctx) {
  const needle = requireValue(ctx.flags, 'needle');
  const kind = ctx.flags.kind;
  if (!QUERY_KINDS.includes(kind)) {
    throw new Error(`query: --kind must be one of ${QUERY_KINDS.join('|')}; got ${JSON.stringify(kind)}`);
  }
  const { entries, concepts } = normalizeLookup(
    resolveLookup(kind, needle, { rootDir: ctx.root, specDir: corpusDir(ctx) }),
  );
  const rows = [...entries, ...concepts].map((e) => JSON.stringify(e));
  return {
    data: { kind, needle, entries, concepts },
    text: lines(rows.length ? rows : ['(no entries)']),
  };
}

// ─── scope-narrow: composed from proposeNarrowing (scope-narrow.mjs) and
// isReachable/SCOPE_PLACEHOLDER (resolve.mjs) — scope-narrow.mjs's own `report`
// and `check` are behind a private SUBCOMMANDS map and a main-guard, unreachable
// from here, so this dispatcher rebuilds the same two orchestrations from the
// exported primitives rather than editing that file (AC-005, AC-014).

function liveEntries(dir) {
  const out = [];
  for (const category of CANONICAL) {
    for (const entry of resolveCategory(dir, category).entries) out.push({ ...entry, category });
  }
  return out;
}

function scopeNarrowReport(ctx) {
  const rows = [];
  for (const entry of liveEntries(memDir(ctx))) {
    const proposal = proposeNarrowing(entry);
    if (proposal.confidence !== 'high') continue;
    rows.push({ category: entry.category, key: proposal.key, governs: proposal.proposed_governs, evidence: proposal.evidence });
  }
  return {
    data: { rows },
    text: lines(rows.map((r) => `${r.category}/${r.key}\t${r.governs.join(', ')}\t${r.evidence}`)),
  };
}

function scopeNarrowCheck(ctx) {
  const offenders = liveEntries(memDir(ctx))
    .filter((entry) => asList(entry.fields.scope).includes(SCOPE_PLACEHOLDER) || !isReachable(entry))
    .map((entry) => `${entry.category}/${entry.key}`);
  if (offenders.length) {
    throw new Error(`scope-narrow: ${offenders.length} unreachable or placeheld entr${offenders.length === 1 ? 'y' : 'ies'}: ${offenders.join(', ')}`);
  }
  return {
    data: { offenders: [] },
    text: lines(['scope-narrow: every entry is reachable by at least one leg']),
  };
}

const SCOPE_NARROW_MODES = { report: scopeNarrowReport, check: scopeNarrowCheck };

function scopeNarrow(ctx) {
  const mode = ctx.positional[0];
  const run = SCOPE_NARROW_MODES[mode];
  if (!run) throw new Error(`scope-narrow: expected \`report\` or \`check\`; got ${JSON.stringify(mode ?? '')}`);
  return run(ctx);
}

dispatch({
  name: 'memory-index',
  subcommands: {
    'assert-writable': { summary: 'refuse an unreachable or malformed entry, with the reason', run: assertEntryWritable },
    constraint: { summary: 'write a constraint entry (--key, --state, --governs)', run: constraint },
    'scope-narrow': { summary: 'narrowing proposal for the live store (report|check)', run: scopeNarrow },
    query: { summary: 'resolve a lookup (--kind, --needle)', run: query },
  },
});
