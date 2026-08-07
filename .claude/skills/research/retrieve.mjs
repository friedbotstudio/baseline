// retrieve — deterministic, stdlib-only prior-art retriever for the research phase.
//
// Two lanes answer "what was already reasoned here?", and they answer different
// questions. The TERM lane scans the local decision corpus (archived research/spec
// memos + the decisions and libraries memory files) for overlap with the caller's
// terms — broad, and measured at a 91% hit rate. The STRUCTURAL lane walks each
// scout-touched path up through docs/system/ to the elements that govern it, and
// reads each element's `source_spec:` to name the archived spec that authored it —
// precise, but only a minority of elements carry the field.
//
// Structural hits are LABELLED and ranked above term hits, never substituted for
// them (spec system-spec-delta D5). No third-party dependency (U6); ranking stays a
// pure function of (corpus, terms, touched paths) — inspectable via each hit's
// `via` and `matchedTerms`.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveLookup } from '../memory-index/resolve.mjs';

// ─── Foundation: filesystem primitives (tolerate every missing/unreadable path) ───

function walkForNames(dir, names, acc) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return acc;
  }
  for (const entry of entries) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) walkForNames(abs, names, acc);
    else if (names.has(entry.name)) acc.push(abs);
  }
  return acc;
}

function readOrNull(absFile) {
  try {
    return fs.readFileSync(absFile, 'utf8');
  } catch {
    return null;
  }
}

function relForward(root, absFile) {
  return path.relative(root, absFile).split(path.sep).join('/');
}

const EXCERPT_LIMIT = 160;

// Truncate on CODE POINTS, not UTF-16 units. `.slice()` cuts an astral character
// in half and leaves a lone surrogate behind — valid in a JS string, invalid the
// moment a consumer writes the excerpt back out as UTF-8.
function truncateChars(text, limit) {
  const points = [...text];
  return points.length <= limit ? text : points.slice(0, limit).join('');
}

// ─── Foundation: the archived-spec lookup behind `source_spec:` ───

// `source_spec:` holds a workflow SLUG read out of a file on disk, and that slug
// is about to become a path. REJECT anything that is not a plain slug — never
// repair it. Normalising here would silently read a DIFFERENT spec than the one
// the corpus named, which is the traversal (CWE-22) wearing a helpful face.
const SAFE_SLUG = /^[a-z0-9][a-z0-9-]*$/;
const MAX_SLUG_LENGTH = 128;

function isResolvableSlug(slug) {
  return slug.length <= MAX_SLUG_LENGTH && SAFE_SLUG.test(slug);
}

// A slug can appear under more than one archive date (an epic parent and its
// slices land separately), so every match is returned rather than the first.
// `spec.approved` is an approval TOKEN, not a spec, and is deliberately not a
// fallback — a bundle holding only that one resolves to nothing.
function archiveSpecsFor(root, slug) {
  const archiveRoot = path.join(root, 'docs', 'archive');
  let dates;
  try {
    dates = fs.readdirSync(archiveRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
  } catch {
    return [];
  }
  return dates
    .map((date) => path.join(archiveRoot, date, slug, 'spec.md'))
    .filter((abs) => fs.existsSync(abs));
}

// ─── Foundation: corpus discovery ───

// The decision corpus is shape-agnostic: a sharded category contributes one file
// per fact, a flat one contributes the single file. The previous
// `.filter(existsSync)` on a flat-only path silently yielded nothing once the
// store was sharded, so /research Step 0 retrieved zero prior art and derived
// fresh while believing it had searched.
function memoryCorpusFiles(root) {
  const memRoot = path.join(root, '.claude', 'memory');
  const files = [];
  for (const category of ['decisions', 'libraries']) {
    const dir = path.join(memRoot, category);
    if (fs.existsSync(dir) && fs.statSync(dir).isDirectory()) {
      for (const name of fs.readdirSync(dir).filter((f) => f.endsWith('.md')).sort()) {
        files.push(path.join(dir, name));
      }
      continue;
    }
    const flat = path.join(memRoot, `${category}.md`);
    if (fs.existsSync(flat)) files.push(flat);
  }
  return files;
}

function corpusFiles(root) {
  const archived = walkForNames(path.join(root, 'docs', 'archive'), new Set(['research.md', 'spec.md']), []);
  return [...archived, ...memoryCorpusFiles(root)];
}

// ─── Domain: scoring + ranking ───

function normalizeTerms(terms) {
  const seen = new Set();
  for (const raw of terms || []) {
    const t = String(raw).trim().toLowerCase();
    if (t) seen.add(t);
  }
  return [...seen].sort();
}

function scoreSource(content, normTerms) {
  const lower = content.toLowerCase();
  const matchedTerms = normTerms.filter((t) => lower.includes(t));
  if (matchedTerms.length === 0) return null;
  return { score: matchedTerms.length, matchedTerms, excerpt: firstMatchingLine(content, matchedTerms) };
}

function firstMatchingLine(content, matchedTerms) {
  for (const line of content.split(/\r?\n/)) {
    const lower = line.toLowerCase();
    if (matchedTerms.some((t) => lower.includes(t))) return truncateChars(line.trim(), EXCERPT_LIMIT);
  }
  return '';
}

// A structurally-resolved spec earns its place by provenance, not by term overlap,
// so it may match no term at all. It still owes the reader an excerpt.
function firstNonEmptyLine(content) {
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed) return truncateChars(trimmed, EXCERPT_LIMIT);
  }
  return '';
}

function rankHits(hits) {
  return hits.sort((a, b) => (b.score - a.score) || (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

// ─── Domain: the structural lane ───

// `resolveLookup('by_path', …)` returns `{elements, concepts}` when a specDir is
// given AND the architecture-map flag is on, and a bare `[]` otherwise. Reading
// `.elements` off both shapes is what makes the flag-off path inert rather than a
// throw — an opt-in layer that errors when it is off has not been opted out of.
function elementsGoverning(touchedPath, { root, absSpecDir }) {
  const lookup = resolveLookup('by_path', touchedPath, { rootDir: root, specDir: absSpecDir });
  return lookup?.elements ?? [];
}

function structuralLane({ root, touchedPaths, specDir }) {
  const resolved = [];
  const unresolved = [];
  if (!Array.isArray(touchedPaths) || touchedPaths.length === 0 || !specDir) return { resolved, unresolved };

  const absSpecDir = path.isAbsolute(specDir) ? specDir : path.join(root, specDir);
  const visited = new Set();
  for (const touchedPath of touchedPaths) {
    for (const element of elementsGoverning(touchedPath, { root, absSpecDir })) {
      // Absent and blank are different facts. An element with no `source_spec:`
      // never claimed provenance; one that declares the field and leaves it empty
      // claimed it and cannot deliver, which is a corpus defect worth reporting.
      if (element.source_spec === undefined || element.source_spec === null) continue;
      if (visited.has(element.id)) continue;
      visited.add(element.id);
      const sourceSpec = String(element.source_spec);
      const specs = isResolvableSlug(sourceSpec) ? archiveSpecsFor(root, sourceSpec) : [];
      if (specs.length === 0) {
        unresolved.push({ element: element.id, source_spec: sourceSpec });
        continue;
      }
      for (const abs of specs) {
        resolved.push({ element: element.id, source_spec: sourceSpec, path: relForward(root, abs) });
      }
    }
  }
  return { resolved, unresolved };
}

// ─── Domain: merging the two lanes into one ordered result ───

// A path both lanes claim survives once, carrying the stronger label and the
// weaker lane's evidence: `via: "source_spec"` with the term score and
// matchedTerms intact. Dropping either half would make the ranking unreadable.
function structuralHitFor(rel, termHit, contentByPath) {
  if (termHit) return { ...termHit, via: 'source_spec' };
  return {
    path: rel,
    score: 0,
    matchedTerms: [],
    excerpt: firstNonEmptyLine(contentByPath.get(rel) ?? ''),
    via: 'source_spec',
  };
}

function mergeLanes(termHits, resolved, contentByPath) {
  const termByPath = new Map(termHits.map((hit) => [hit.path, hit]));
  const claimed = new Set(resolved.map((row) => row.path));

  const structural = [...claimed].map((rel) => structuralHitFor(rel, termByPath.get(rel), contentByPath));
  const terms = termHits.filter((hit) => !claimed.has(hit.path)).map((hit) => ({ ...hit, via: 'terms' }));

  return [...rankHits(structural), ...rankHits(terms)];
}

function scanCorpus(root, normTerms) {
  const contentByPath = new Map();
  const termHits = [];
  for (const abs of corpusFiles(root)) {
    const content = readOrNull(abs);
    if (content === null) continue;
    const rel = relForward(root, abs);
    contentByPath.set(rel, content);
    if (normTerms.length === 0) continue;
    const scored = scoreSource(content, normTerms);
    if (scored) termHits.push({ path: rel, ...scored });
  }
  return { contentByPath, termHits };
}

export function retrieve({ root = process.cwd(), slug, terms, touchedPaths, specDir } = {}) {
  const normTerms = normalizeTerms(terms);
  const { contentByPath, termHits } = scanCorpus(root, normTerms);
  const { resolved, unresolved } = structuralLane({ root, touchedPaths, specDir });

  const corpusScanned = [...contentByPath.keys()].sort();
  const hits = mergeLanes(termHits, resolved, contentByPath);

  return {
    terms: normTerms,
    corpusScanned,
    hits,
    structural: resolved,
    structuralUnresolved: unresolved,
    summary: { corpusScanned: corpusScanned.length, hits: hits.length, structural: resolved.length },
  };
}

// ─── Orchestration: CLI ───

// `--touched` takes ONE quoted JSON array, not a word-split list: zsh does not
// word-split an unquoted expansion, and that ambiguity has already cost this
// codebase one silent no-op. Malformed input degrades to "no structural lane"
// rather than to an error — the term lane is still worth running.
function parseTouched(raw) {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((entry) => typeof entry === 'string') : [];
  } catch {
    return [];
  }
}

function parseArgs(argv) {
  const out = { slug: undefined, root: process.cwd(), terms: [], touchedPaths: [], specDir: 'docs/system' };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (flag === '--slug') out.slug = argv[++i];
    else if (flag === '--root') out.root = argv[++i];
    else if (flag === '--terms') out.terms = String(argv[++i] || '').split(/[\s,]+/).filter(Boolean);
    else if (flag === '--touched') out.touchedPaths = parseTouched(argv[++i]);
    else if (flag === '--spec-dir') out.specDir = argv[++i];
  }
  return out;
}

const EMPTY_RESULT = {
  terms: [],
  corpusScanned: [],
  hits: [],
  structural: [],
  structuralUnresolved: [],
  summary: { corpusScanned: 0, hits: 0, structural: 0 },
};

// The counts live in the JSON, not only in the stderr line below. A consumer that
// merges the two streams — the ordinary shape of a shell invocation — would
// otherwise hand JSON.parse a trailing prose line and get nothing at all.
function main() {
  let result;
  try {
    const { slug, root, terms, touchedPaths, specDir } = parseArgs(process.argv.slice(2));
    result = retrieve({ root, slug, terms, touchedPaths, specDir });
  } catch {
    result = EMPTY_RESULT;
  }
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  process.stderr.write(
    `retrieve: scanned ${result.summary.corpusScanned} sources, ${result.summary.hits} hits ` +
    `(${result.summary.structural} structural)\n`
  );
  process.exit(0);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
