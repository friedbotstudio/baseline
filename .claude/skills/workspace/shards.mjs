// Domain — per-element PlantUML shards.
//
// The join between a shard and its element is the `!startsub` SECTION NAME, not a
// parsed C4 declaration (spec D6). Only 37% of C4 labels in this repo's live specs
// are path-like, so a label cannot carry the anchor; a section-name join needs no
// PlantUML parser and makes drift detectable BOTH ways — a section with no element
// is an orphan, an element with no shard is unillustrated.

import { listWorkspaceFiles, readRecords, readSourceText } from './store.mjs';

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

function shardRel(elementId) {
  return `${SHARD_DIR}/${elementId}.puml`;
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
