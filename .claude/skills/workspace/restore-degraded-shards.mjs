// Domain — restore diagram shards that a rewrite collapsed to the three-argument
// Component form.
//
// Git history is the PRIMARY source and is tried first for every candidate, because
// it is the only lossless one. Element records under docs/system/elements/ hold id,
// kind, title and anchor but no `techn`, and 51 shards declare `subsystem` there
// while their record reads `kind: component` — a repair that reached for records
// first would rewrite all 51 and finish the job the defect started.
//
// The record is the FALLBACK, and only for a shard that was never rich: with no
// blob to lose, filling label from the anchor and description from the title is
// additive, and leaving `techn` at the kind takes nothing away.

import { execFileSync } from 'node:child_process';
import { existsSync, lstatSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

import { renderComponentLine, sectionFromElementId } from './shards.mjs';
import { readRecords } from './store.mjs';

const SPEC_DIR = 'docs/system';
const THREE_ARG = /^Component\(([^,]+),\s*"([^"]*)",\s*"([^"]*)"\)\s*$/m;
const FOUR_ARG = /^Component\([^,]+,\s*"[^"]*",\s*"[^"]*",\s*".*"\)\s*$/m;

// Three arguments alone does not mean damaged. A shard created for an element with
// no description legitimately has three, and two in this corpus carry real labels
// ("Pinned spec resolver", ".claude/skills/system-reconcile/*.mjs"). The DAMAGE has
// a fingerprint: the rewrite substituted the element id for the label and the kind
// for the techn, so both slots equal what the writer falls back to. Matching the
// fingerprint rather than the argument count keeps healthy shards out of the report.
function isDegraded(text, elementId, kind) {
  const m = THREE_ARG.exec(text);
  return m !== null && m[2] === elementId && m[3] === kind;
}

function kindOf(text) {
  const m = /^'\s*@kind\s+(\S+)\s*$/m.exec(text);
  return m === null ? null : m[1];
}

function git(rootDir, args) {
  try {
    return execFileSync('git', args, { cwd: rootDir, encoding: 'utf8' });
  } catch {
    return null;
  }
}

function commitsTouching(rootDir, relPath) {
  const log = git(rootDir, ['log', '--format=%H', '--', relPath]);
  return log === null ? [] : log.split('\n').filter(Boolean);
}

// Newest first, so the first four-argument blob found is the last good state.
function lastRichBlob(rootDir, relPath) {
  for (const sha of commitsTouching(rootDir, relPath)) {
    const content = git(rootDir, ['show', `${sha}:${relPath}`]);
    if (content !== null && FOUR_ARG.test(content)) return { sha, content };
  }
  return null;
}

// A symlink is classified but never written through: `writeFileSync` follows it, so
// a link planted in the diagrams directory would land a Component line wherever it
// points (security review 2026-08-12, CWE-59). It is reported rather than skipped —
// a shard that cannot be repaired safely is exactly what `unrestorable` is for. A
// directory wearing a `.puml` name is skipped outright, because it is not a damaged
// shard and belongs in no bucket; reading it would throw EISDIR and abort the sweep.
function classifyEntry(dir, name) {
  const stat = lstatSync(join(dir, name), { throwIfNoEntry: false });
  if (stat === undefined) return 'skip';
  if (stat.isSymbolicLink()) return 'link';
  return stat.isFile() ? 'file' : 'skip';
}

// Paths in the report are repo-relative because they are also the argv `git log`
// and `git show` receive, and git resolves a pathspec against the repo root — not
// against `specDir`. Deriving one from the other keeps a custom `--spec-dir` from
// silently producing paths git cannot find.
function degradedShards(rootDir, specDir) {
  const dir = join(specDir, 'diagrams');
  if (!existsSync(dir)) return [];
  const out = [];
  for (const name of readdirSync(dir).sort()) {
    if (!name.endsWith('.puml')) continue;
    const entry = classifyEntry(dir, name);
    if (entry === 'skip') continue;
    const path = relative(rootDir, join(dir, name));
    if (entry === 'link') {
      out.push({ path, elementId: name.replace(/\.puml$/, ''), text: null });
      continue;
    }
    const text = readFileSync(join(dir, name), 'utf8');
    const elementId = name.replace(/\.puml$/, '');
    const kind = kindOf(text);
    if (kind !== null && isDegraded(text, elementId, kind)) out.push({ path, elementId, text });
  }
  return out;
}

function recordIndex(specDir) {
  const index = new Map();
  for (const element of readRecords(specDir, 'elements')) index.set(element.id, element);
  return index;
}

// Rewrites the Component line in place rather than regenerating the shard, so a
// `' @witness` annotation the record cannot carry survives the repair. Returns null
// for anything it cannot fill honestly — a record missing anchor or title, or one
// whose values carry a quote that renderComponentLine rejects.
// The section comes from the ELEMENT ID, never from `m[1]`. `Component([^,]+, …)`
// admits quotes and parens, so reading the section back out of the file under
// repair let a corrupt shard propagate its corruption into a file the repair then
// reported as restored (security review 2026-08-12). The id↔section map is the
// canonical join (spec D6), so deriving it is also the more correct answer.
function rebuiltFromRecord(text, elementId, record) {
  if (!record?.anchor || !record?.title) return null;
  const m = THREE_ARG.exec(text);
  let line;
  try {
    line = renderComponentLine(sectionFromElementId(elementId), { label: record.anchor, technology: m[3], description: record.title });
  } catch {
    return null;
  }
  // A function replacement, because an anchor containing `$&` or `$1` would be
  // expanded as a capture reference by the string form and silently rewritten.
  return text.replace(THREE_ARG, () => line);
}

// A shard with neither a rich blob nor a usable record is REPORTED, never
// reconstructed. Inventing plausible content is how a repair becomes a second data
// loss.
export function restoreDegradedShards({ rootDir = process.cwd(), specDir = join(rootDir, SPEC_DIR), dryRun = false } = {}) {
  const restored = [];
  const recordRestored = [];
  const unrestorable = [];
  const records = recordIndex(specDir);
  for (const shard of degradedShards(rootDir, specDir)) {
    if (shard.text === null) {
      unrestorable.push(shard.path);
      continue;
    }
    const rich = lastRichBlob(rootDir, shard.path);
    const content = rich === null ? rebuiltFromRecord(shard.text, shard.elementId, records.get(shard.elementId)) : rich.content;
    if (content === null) {
      unrestorable.push(shard.path);
      continue;
    }
    if (!dryRun) writeFileSync(join(rootDir, shard.path), content, 'utf8');
    if (rich === null) recordRestored.push({ path: shard.path, content });
    else restored.push({ path: shard.path, content, sha: rich.sha });
  }
  return { restored, recordRestored, unrestorable };
}
