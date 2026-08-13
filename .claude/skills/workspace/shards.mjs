// Domain — per-element PlantUML shards.
//
// The join between a shard and its element is the `!startsub` SECTION NAME, not a
// parsed C4 declaration (spec D6). Only 37% of C4 labels in this repo's live specs
// are path-like, so a label cannot carry the anchor; a section-name join needs no
// PlantUML parser and makes drift detectable BOTH ways — a section with no element
// is an orphan, an element with no shard is unillustrated.

import { assertSafeSlug } from '../../hooks/lib/slug.mjs';
import { assertSafeFieldValue } from '../memory-index/migrate.mjs';
import { architectureMapEnabled } from './flags.mjs';
import { listWorkspaceFiles, readRecords, readSourceText, writeWorkspaceFile } from './store.mjs';

const SECTION = /^!startsub\s+([A-Za-z0-9_-]+)\s*$/m;
const SHARD_DIR = 'diagrams';

// A shard declares its kind, and the test that witnesses it, in PlantUML comments —
// the same `' @kind <x>` form the dependency-graph rule already uses. Reusing that
// convention keeps the corpus to ONE annotation syntax; a frontmatter block would
// not survive a `.puml` round-trip through any PlantUML tool anyway.
const KIND = /^'\s*@kind\s+([A-Za-z0-9_-]+)\s*$/m;
const WITNESS_TEST = /^'\s*@witness\s+(\S+)\s*$/m;

function annotation(text, pattern) {
  const match = pattern.exec(text);
  return match ? match[1] : null;
}

// PlantUML rejects a hyphen in a `!startsub` name ("Bad sub name"), and element ids
// are kebab-case by assertSafeFactKey — so a section name is the id with hyphens
// swapped for underscores. The map is injective because an id can never contain an
// underscore, which is what keeps the D6 join total in both directions.
export function elementIdFromSection(section) {
  return String(section).replace(/_/g, '-');
}

// The inverse of elementIdFromSection. Every live shard is written this way, and
// the map stays injective because an id can never contain an underscore.
export function sectionFromElementId(elementId) {
  return elementId.replace(/-/g, '_');
}

// The section is the one Component argument interpolated raw — C4 takes it as a
// bare alias, not a quoted string, so quotedArgument cannot bound it. A caller that
// reads a section back out of an existing shard gets `[^,]+`, which admits quotes
// and parens and escapes the macro exactly as a quoted argument would (security
// review 2026-08-12). Guarded here rather than at each call site because the export
// is public: `sectionFromElementId` output always passes, and anything else is a
// caller that should have derived it from the element id.
const BARE_SECTION = /^[A-Za-z0-9_]+$/;

function assertSection(section) {
  if (!BARE_SECTION.test(String(section))) {
    throw new Error(`unsafe field section (REJECT, never normalize): a section must be a bare identifier, got ${JSON.stringify(String(section))}`);
  }
  return section;
}

function shardRel(elementId) {
  return `${SHARD_DIR}/${elementId}.puml`;
}

// Everything interpolated into a `Component(...)` argument. assertSafeFieldValue
// bounds newlines — which forge a whole directive — but a double quote closes the
// argument early and appends attacker-chosen ones (`ok", "X` turns Component/3 into
// Component/5). PlantUML has no portable escape for a quote inside a macro argument,
// so this REJECTS rather than normalizes: a rewritten label renders as something
// other than what the caller named. Guarded here, not in assertSafeFieldValue, whose
// other callers are frontmatter fields where a quote is legitimate.
function quotedArgument(name, value) {
  if (String(value).includes('"')) {
    throw new Error(`unsafe field ${name} (REJECT, never normalize): a quote escapes the C4 argument`);
  }
  return assertSafeFieldValue(name, value);
}

// An unwritable shard is worse than an absent one: `witness.bindingFor` reads the
// kind off the shard, so a shard with no kind binds `none` and quietly demotes its
// element to unwitnessed. Refusing here is what keeps that state deliberate.
function requireKind(kind) {
  if (!kind) throw new Error('writeDiagramShard: a shard must declare its kind — refusing to write an unwitnessable shard');
  return quotedArgument('kind', kind);
}

// C4's `techn` argument and the diagram kind are different axes, and conflating
// them loses data: 51 shards in this corpus declare `subsystem` there while their
// element record reads `kind: component`, and that distinction exists nowhere else
// on disk. `technology` therefore defaults to the kind — which keeps every shard
// written before the backfill byte-identical — and `descr` is emitted only when the
// caller has one, so the three- and four-argument forms stay distinguishable.
export function renderComponentLine(section, { label, technology, description }) {
  const args = [assertSection(section), `"${quotedArgument('label', label)}"`, `"${quotedArgument('technology', technology)}"`];
  if (description !== null) args.push(`"${quotedArgument('description', description)}"`);
  return `Component(${args.join(', ')})`;
}

// componentLine's inverse, and it lives here so the pair cannot drift apart. The
// description group is greedy to the final `")` rather than `[^"]*` on purpose: a
// description carrying a stray quote must come back INTACT so quotedArgument can
// reject it. A non-greedy read would truncate at the stray quote and hand a
// silently-shortened string to the writer.
const COMPONENT_ARGS = /^Component\([^,]+,\s*"([^"]*)",\s*"([^"]*)"(?:,\s*"(.*)")?\)\s*$/m;

function parseComponentArgs(text) {
  const m = COMPONENT_ARGS.exec(text);
  if (!m) return null;
  return { label: m[1], technology: m[2], description: m[3] ?? null };
}

// Preservation is best-effort: an absent or unparseable shard yields null and the
// caller falls back to its defaults. A shard nobody can parse must not wedge a
// legitimate write.
function readExistingFields(specDir, elementId) {
  const shard = readShard(specDir, elementId);
  return shard === null ? null : parseComponentArgs(shard.body);
}

// Caller wins, then whatever the shard already carried, then the historical
// defaults. Those defaults used to be the FIRST choice, which is how a rewrite
// supplying only `kind` destroyed the anchor, the techn and the title of every
// element it touched.
function mergedFields({ elementId, kind, existing, label, technology, description }) {
  return {
    label: label ?? existing?.label ?? elementId,
    technology: technology ?? existing?.technology ?? kind,
    description: description ?? existing?.description ?? null,
  };
}

// D3 — the annotations sit INSIDE the block. `!includesub file.puml!NAME` pulls in
// only the block's content (verified: https://plantuml.com/en/preprocessing), so an
// annotation above `!startsub` is dropped at exactly the moment a view composes it.
function shardText(section, { kind, witnessTest, ...component }) {
  const lines = [`!startsub ${section}`, `' @kind ${kind}`];
  if (witnessTest !== null) lines.push(`' @witness ${witnessTest}`);
  lines.push(renderComponentLine(section, component), '!endsub');
  return lines.join('\n') + '\n';
}

// The corpus's shard writer. Idempotent by construction: the output is a pure
// function of the arguments, so re-running a backfill rewrites identical bytes.
//
// Every interpolated field goes through assertSafeFieldValue for the same reason
// render.composeView validates its title: a newline forges an arbitrary PlantUML
// directive into the composed document (the MEDIUM finding fixed one layer up).
//
// The flag gate runs BEFORE id validation on purpose (§Behavior #13): an opted-out
// project gets an empty result and no throw, and neither branch constructs a path,
// so ordering the gate first costs nothing and makes inertness total.
export function writeDiagramShard(specDir, elementId, {
  kind, witnessTest = null, label = null, technology = null, description = null, rootDir = process.cwd(),
} = {}) {
  if (!architectureMapEnabled({ rootDir })) return { path: null, written: false };
  assertSafeSlug(elementId, 'element id');
  const section = sectionFromElementId(elementId);
  const safeKind = requireKind(kind);
  const merged = mergedFields({
    elementId,
    kind: safeKind,
    existing: readExistingFields(specDir, elementId),
    label,
    technology,
    description,
  });
  const text = shardText(section, {
    kind: safeKind,
    witnessTest: witnessTest === null ? null : assertSafeFieldValue('witnessTest', witnessTest),
    label: quotedArgument('label', merged.label),
    technology: quotedArgument('technology', merged.technology),
    description: merged.description === null ? null : quotedArgument('description', merged.description),
  });
  if (readSourceText(specDir, shardRel(elementId)) === text) return { path: shardRel(elementId), written: false };
  writeWorkspaceFile(specDir, SHARD_DIR, `${elementId}.puml`, text);
  return { path: shardRel(elementId), written: true };
}

// `specDir` is the root the shard path is relative to, so readSourceText's traversal
// guard covers shard reads exactly as it covers source reads.
export function readShard(specDir, elementId) {
  const text = readSourceText(specDir, shardRel(elementId));
  if (text === null) return null;
  const match = SECTION.exec(text);
  if (!match) return null;
  return {
    path: shardRel(elementId),
    section: match[1],
    body: text,
    kind: annotation(text, KIND),
    witnessTest: annotation(text, WITNESS_TEST),
  };
}

// Advisory, never an error: an element with no diagram is a gap in illustration,
// not a broken model. Reporting it as a failure would make every new element a
// build break before anyone had drawn it.
export function findUnillustrated(specDir) {
  return readRecords(specDir, 'elements')
    .filter((element) => readShard(specDir, element.id) === null)
    .map((element) => element.id);
}

// Every shard file on disk with the section it declares — the file-side view the
// orphan check needs, since an orphan by definition has no record to enumerate.
export function everyShardSection(specDir) {
  const out = [];
  for (const name of listWorkspaceFiles(specDir, 'diagrams', '.puml')) {
    const text = readSourceText(specDir, `${SHARD_DIR}/${name}`);
    const match = text === null ? null : SECTION.exec(text);
    if (match) out.push({ file: name, section: match[1] });
  }
  return out;
}
