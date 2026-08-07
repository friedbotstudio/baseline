// Domain — what a spec DECLARES it changes about the standing model, and whether
// the landed diff bears that out.
//
// Two halves with deliberately opposite failure modes.
//
// DECLARING is `parseDelta`: pure and total — no filesystem, no config, never
// throws. A malformed row is data (`errors[]`), not an exception, because its
// caller is a preflight check that must report every offending row rather than die
// on the first one.
//
// PROVING is `verifyDelta` / `applyDelta` / `verifyAndApplyDelta`. These read the
// tree, write the corpus, and throw on a hostile row. `/archive` Step 5 calls
// `verifyAndApplyDelta` and is the corpus's only writer on the primary tree, so a
// row it cannot confirm must apply nothing at all — a preflight survives bad input,
// a writer refuses it.
//
// The verbs are the corpus's existing op vocabulary, not a new one
// (`conflicts-are-reported-never-auto-resolved-2026-08-04`).

import { join } from 'node:path';

import { assertSafeSlug } from '../../hooks/lib/slug.mjs';
import { readConcepts, writeConcept } from './concepts.mjs';
import { anchorMatches, governedFiles } from './coverage.mjs';
import { stampElement } from './digest.mjs';
import { architectureMapEnabled } from './flags.mjs';
import { materialize } from './materialize.mjs';
import { writeDiagramShard } from './shards.mjs';
import { assertNoTraversal, readAll, readSourceText } from './store.mjs';

const SECTION_RE = /^##\s+System\s+delta\s*$([\s\S]*?)(?=^##\s|$(?![\s\S]))/im;
const NONE_RE = /^\*?\(?\s*none\s*\)?\*?$/i;
const SEPARATOR_RE = /^\|?[\s:|-]+\|?$/;

const VERBS = new Set(['add', 'change', 'remove']);
const COLUMNS = ['verb', 'elementId', 'anchor', 'concept', 'kind'];

// The verbs that GROW the model. `remove` parses and lints, but nothing in this
// cycle defines what removal means for a concept's authored anchors or for the
// shard left behind, so it is verified and REPORTED rather than applied — the
// corpus's standing rule that a case the machine cannot settle goes to the curator
// (`conflicts-are-reported-never-auto-resolved-2026-08-04`). Applying it blind
// would delete a record on the strength of a table row.
const GROWTH_VERBS = new Set(['add', 'change']);

const SPEC_DIR = 'docs/specs';
const ANCHOR_SEPARATOR = ',';

function sectionBody(specText) {
  const match = SECTION_RE.exec(String(specText == null ? '' : specText));
  return match ? match[1].trim() : null;
}

function splitCells(line) {
  return line.trim().replace(/^\|/, '').replace(/\|\s*$/, '').split('|').map((c) => c.trim());
}

function isTableLine(line) {
  return line.trim().startsWith('|');
}

// The header and its separator carry no data. Dropping them by shape rather than by
// position keeps a table readable when an author adds a blank line between them.
function isHeaderOrSeparator(cells, line) {
  return SEPARATOR_RE.test(line.trim()) || cells[0].toLowerCase() === 'verb';
}

function rowFrom(cells) {
  return COLUMNS.reduce((row, name, i) => ({ ...row, [name]: cells[i] }), {});
}

function defectIn(cells, lineNumber) {
  if (cells.length !== COLUMNS.length) {
    return `row ${lineNumber}: expected ${COLUMNS.length} cells (${COLUMNS.join(' | ')}), got ${cells.length}`;
  }
  const [verb] = cells;
  if (!VERBS.has(verb.toLowerCase())) {
    return `row ${lineNumber}: unknown verb ${JSON.stringify(verb)} (expected add, change or remove)`;
  }
  const blank = COLUMNS.filter((name, i) => !cells[i]);
  if (blank.length) {
    return `row ${lineNumber}: empty ${blank.join(', ')}`;
  }
  return null;
}

export function parseDelta(specText) {
  const body = sectionBody(specText);
  if (body === null) return { rows: [], errors: [], empty: false };
  if (NONE_RE.test(body)) return { rows: [], errors: [], empty: true };

  const rows = [];
  const errors = [];
  body.split('\n').forEach((line, index) => {
    if (!isTableLine(line)) return;
    const cells = splitCells(line);
    if (isHeaderOrSeparator(cells, line)) return;
    const defect = defectIn(cells, index + 1);
    if (defect) errors.push(defect);
    else rows.push(rowFrom(cells));
  });

  return { rows, errors, empty: false };
}

// ─── Verification — does the landed diff confirm what the spec declared? ───

// A concept's `anchors:` field is comma-delimited and each row splits on its first
// `=`, so an anchor carrying either delimiter forges a SECOND declaration — one
// approved delta row materializing two elements, the extra one anchored wherever the
// injected text points and absent from the table a reviewer read at gate A. Measured
// during the phase-8 review (docs/security/system-spec-delta-slice-c-2026-08-07.md).
// REJECT rather than strip, for the reason `quotedArgument` rejects a quote: a
// normalized anchor points somewhere other than what the author named.
function assertAnchorIsSafe(anchor) {
  assertNoTraversal(anchor);
  if (/[,=]/.test(String(anchor))) {
    throw new Error(
      `unsafe anchor (REJECT, never normalize): ${JSON.stringify(String(anchor).slice(0, 80))} `
      + 'carries a delimiter the concept anchors field uses',
    );
  }
  return anchor;
}

// Validated BEFORE any read or write. A row is spec-authored text that becomes a
// filesystem path, so a traversal must fail as a traversal rather than as the ENOENT
// it turns into once a path is built (CWE-22 — REJECT, never repair).
function assertRowsAreSafe(rows) {
  for (const row of rows) {
    assertSafeSlug(row.elementId, 'delta element id');
    assertSafeSlug(row.concept, 'delta concept id');
    assertAnchorIsSafe(row.anchor);
  }
}

// The two directions the same matcher is asked in: one anchor against many paths,
// and many anchors against one path.
const anchorHits = (anchor, paths) => paths.some((path) => anchorMatches(anchor, path));
const pathClaimed = (anchors, path) => anchors.some((anchor) => anchorMatches(anchor, path));

// Touched AND present, not one or the other. Presence alone confirms a row this
// landing never went near — the failure `syncBack` already has, restated; a touch
// alone confirms a row whose anchor the author mistyped. Presence is asked of the
// governed file list rather than of the filesystem so a glob anchor answers the
// same way a file anchor does.
function confirms(row, touchedPaths, governed) {
  if (!GROWTH_VERBS.has(row.verb.toLowerCase())) return false;
  return anchorHits(row.anchor, touchedPaths) && anchorHits(row.anchor, governed);
}

// A governed path this landing touched that neither a delta row nor an element on
// disk accounts for. That is the coverage gap Step 5 used to open silently every
// time a landing added a file.
function unclaimedIn({ rows, touchedPaths, specDir, governed }) {
  const governedSet = new Set(governed);
  const anchors = [
    ...rows.map((row) => row.anchor),
    ...readAll(specDir).elements.map((element) => element.anchor),
  ].filter(Boolean);
  return touchedPaths.filter((path) => governedSet.has(path) && !pathClaimed(anchors, path));
}

export function verifyDelta({ rows = [], touchedPaths = [], specDir, rootDir = process.cwd() } = {}) {
  assertRowsAreSafe(rows);

  const governed = governedFiles({ rootDir });
  const confirmed = rows.filter((row) => confirms(row, touchedPaths, governed));
  return {
    confirmed,
    drift: rows.filter((row) => !confirmed.includes(row)),
    unclaimed: unclaimedIn({ rows, touchedPaths, specDir, governed }),
    // The distinction the whole return shape exists for: "you passed me nothing"
    // and "nothing matched" are opposite situations, and one shape for both already
    // produced a silent no-op on a real landing.
    inputEmpty: touchedPaths.length === 0,
  };
}

// ─── Application — only what verification confirmed ───

// Built fresh per call, never spread from a shared literal: a module-level constant
// would hand every caller the SAME arrays, so one caller pushing to its result would
// silently grow the next caller's.
const nothingApplied = () => ({ applied: [], shardsWritten: [], skippedGlob: [] });

function anchorRowsOf(concept) {
  return String(concept.anchors ?? '').split(ANCHOR_SEPARATOR).map((row) => row.trim()).filter(Boolean);
}

// The `id=path` form, not a bare path: a bare anchor routes through `deriveId`,
// which appends a hash, and the element the delta row NAMED would never appear.
function declareAnchor(specDir, { elementId, anchor, concept: conceptId }) {
  const concept = readConcepts(specDir).find((entry) => entry.id === conceptId);
  if (!concept) {
    throw new Error(`delta row names concept ${JSON.stringify(conceptId)}, which this corpus does not carry`);
  }
  const declared = anchorRowsOf(concept);
  const declaration = `${elementId}=${anchor}`;
  if (declared.includes(declaration)) return;
  const result = writeConcept(specDir, conceptId, {
    title: concept.title ?? conceptId,
    members: concept.members,
    anchors: [...declared, declaration].join(ANCHOR_SEPARATOR),
  });
  // `writeConcept` REPORTS a refusal rather than throwing one, so an unchecked call
  // leaves the anchor undeclared, the element unmaterialized, and the row neither
  // applied nor reported as drift — a silent no-op of exactly the kind this whole
  // step exists to make impossible.
  if (!result.written) {
    throw new Error(
      `concept ${conceptId} names unresolvable members: ${(result.unresolved ?? []).join(', ')}`,
    );
  }
}

// Every anchor is declared BEFORE anything is materialized, so a batch carrying one
// unresolvable row writes nothing at all — the same atomic rejection `materialize`
// and `applyContribution` already hold, for the same reason: a corpus holding half a
// batch reflects an intent nobody had. It also runs `materialize` once per landing
// instead of once per row, which matters because it rewrites concept records whether
// or not they changed.
export function applyDelta({ confirmed = [], specDir, rootDir = process.cwd() } = {}) {
  if (!confirmed.length) return nothingApplied();

  // Re-validated here rather than trusted from `verifyDelta`. This is an exported
  // writer, so a second caller will eventually reach it directly — and until this
  // line existed, `materialize` was the first thing to inspect an anchor, by which
  // point `declareAnchor` had already committed a traversal string to the concept
  // file, wedging every later materialize in the repo (phase-8 finding 2).
  assertRowsAreSafe(confirmed);

  for (const row of confirmed) declareAnchor(specDir, row);
  materialize({ specDir, rootDir });

  const result = nothingApplied();
  for (const row of confirmed) {
    // Partitioned rather than counted (backlog `syncback-applied-overstates-what-it-
    // stamped-8e21`): a glob names a family, so it has no single interface to hash
    // and never earns a digest. Reporting it as applied-and-skipped is two true
    // facts; folding it into one `applied` count is the receipt that measured 2.7x.
    const stamped = stampElement(specDir, row.elementId, { rootDir });
    if (stamped.state === 'unknown') continue;
    if (stamped.state === 'not-applicable') result.skippedGlob.push(row.elementId);
    result.applied.push(row.elementId);

    const shard = writeDiagramShard(specDir, row.elementId, { kind: row.kind, rootDir });
    if (shard.written) result.shardsWritten.push(shard.path);
  }

  return result;
}

// ─── The archive entry point (D1) ───

const nothingAtAll = () => ({ confirmed: [], drift: [], unclaimed: [], ...nothingApplied() });

// One entry point, so archive's SKILL.md carries ONE `node -e` invocation and there
// is a single site for the quoted-JSON-array discipline the zsh landmine demands.
//
// The flag gate runs before slug and row validation, matching `writeDiagramShard`:
// an opted-out project gets an empty result and no throw, and neither branch
// constructs a path, so ordering the gate first costs nothing and makes inertness
// total.
export function verifyAndApplyDelta({ slug, specDir, rootDir = process.cwd(), touchedPaths = [] } = {}) {
  const inputEmpty = touchedPaths.length === 0;
  if (!architectureMapEnabled({ rootDir })) return { ...nothingAtAll(), inputEmpty };

  assertSafeSlug(slug, 'delta workflow slug');
  const { rows } = parseDelta(readSourceText(rootDir, join(SPEC_DIR, `${slug}.md`)) ?? '');
  const verdict = verifyDelta({ rows, touchedPaths, specDir, rootDir });
  return { ...verdict, ...applyDelta({ confirmed: verdict.confirmed, specDir, rootDir }) };
}
