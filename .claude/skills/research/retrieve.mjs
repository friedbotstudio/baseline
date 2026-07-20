// retrieve — deterministic, stdlib-only prior-art retriever for the research phase.
//
// Scans the local decision corpus (archived research/spec memos + the decisions
// and libraries memory files) for overlap with the caller's terms, so /research
// retrieves what was already reasoned before deriving new candidates. No third-party
// dependency (U6); ranking is a pure function of (corpus, terms) — inspectable via
// each hit's matchedTerms.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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
    if (matchedTerms.some((t) => lower.includes(t))) return line.trim().slice(0, 160);
  }
  return '';
}

function rankHits(hits) {
  return hits.sort((a, b) => (b.score - a.score) || (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

export function retrieve({ root = process.cwd(), slug, terms } = {}) {
  const normTerms = normalizeTerms(terms);
  const files = corpusFiles(root);
  const corpusScanned = [];
  const hits = [];
  for (const abs of files) {
    const content = readOrNull(abs);
    if (content === null) continue;
    const rel = relForward(root, abs);
    corpusScanned.push(rel);
    if (normTerms.length === 0) continue;
    const scored = scoreSource(content, normTerms);
    if (scored) hits.push({ path: rel, ...scored });
  }
  corpusScanned.sort();
  return { terms: normTerms, corpusScanned, hits: rankHits(hits) };
}

// ─── Orchestration: CLI ───

function parseArgs(argv) {
  const out = { slug: undefined, root: process.cwd(), terms: [] };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (flag === '--slug') out.slug = argv[++i];
    else if (flag === '--root') out.root = argv[++i];
    else if (flag === '--terms') out.terms = String(argv[++i] || '').split(/[\s,]+/).filter(Boolean);
  }
  return out;
}

function main() {
  let result;
  try {
    const { slug, root, terms } = parseArgs(process.argv.slice(2));
    result = retrieve({ root, slug, terms });
  } catch {
    result = { terms: [], corpusScanned: [], hits: [] };
  }
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  process.stderr.write(`retrieve: scanned ${result.corpusScanned.length} sources, ${result.hits.length} hits\n`);
  process.exit(0);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
