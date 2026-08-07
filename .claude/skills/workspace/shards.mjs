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
function sectionFromElementId(elementId) {
  return elementId.replace(/-/g, '_');
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

// D3 — the annotations sit INSIDE the block. `!includesub file.puml!NAME` pulls in
// only the block's content (verified: https://plantuml.com/en/preprocessing), so an
// annotation above `!startsub` is dropped at exactly the moment a view composes it.
function shardText(section, { kind, witnessTest, label }) {
  const lines = [`!startsub ${section}`, `' @kind ${kind}`];
  if (witnessTest !== null) lines.push(`' @witness ${witnessTest}`);
  lines.push(`Component(${section}, "${label}", "${kind}")`, '!endsub');
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
export function writeDiagramShard(specDir, elementId, { kind, witnessTest = null, label = null, rootDir = process.cwd() } = {}) {
  if (!architectureMapEnabled({ rootDir })) return { path: null, written: false };
  assertSafeSlug(elementId, 'element id');
  const section = sectionFromElementId(elementId);
  const text = shardText(section, {
    kind: requireKind(kind),
    witnessTest: witnessTest === null ? null : assertSafeFieldValue('witnessTest', witnessTest),
    label: quotedArgument('label', label ?? elementId),
  });
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
