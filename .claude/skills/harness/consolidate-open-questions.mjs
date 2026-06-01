// Gate-A open-questions consolidator.
//
// At the /approve-spec yield the harness shows a reviewer the open questions
// they must settle before approving. Those questions are scattered across the
// intake, research, and spec artifacts (each under a `## Open questions`
// section) and frequently restate the same question as it travels downstream.
// This module extracts them, dedupes across phases, buckets by source, and
// (via the CLI) prints one consolidated markdown surface.
//
// Pure functions (`extractOpenQuestions`, `consolidateOpenQuestions`) carry the
// logic; `main` is the file-reading CLI the harness invokes.

import { readFileSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

// --- Foundation: parsing primitives ------------------------------------------

const OPEN_QUESTIONS_HEADING = /^##\s+open\s+questions\s*$/i;
const SECTION_HEADING = /^##\s+/;
const BULLET = /^-\s+(.*)$/;
const NONE_PLACEHOLDER = /^\*?\(none\b/i;

// Pull the `- ` bullets under the first `## Open questions` heading, stopping at
// the next `## ` heading. The `*(none — ...)*` empty placeholder is dropped.
export function extractOpenQuestions(markdown) {
  if (typeof markdown !== 'string' || !markdown) return [];
  const lines = markdown.split(/\r?\n/);
  const questions = [];
  let inSection = false;
  for (const line of lines) {
    if (!inSection) {
      if (OPEN_QUESTIONS_HEADING.test(line)) inSection = true;
      continue;
    }
    if (SECTION_HEADING.test(line)) break;
    const m = line.match(BULLET);
    if (!m) continue;
    const text = m[1].trim();
    if (!text || NONE_PLACEHOLDER.test(text)) continue;
    questions.push(text);
  }
  return questions;
}

// Equality key for dedup only — never displayed. Collapses the cosmetic
// differences a question accrues as it is restated downstream (a `**bold key:**`
// prefix, casing, trailing punctuation, whitespace).
function normalizeQuestion(text) {
  return text
    .replace(/\*\*/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.,;:?!]+$/, '');
}

// --- Domain: cross-phase consolidation ---------------------------------------

const PHASE_PRIORITY = ['spec', 'research', 'intake'];

function bucketRank(sources) {
  if (sources.includes('spec')) return 0;
  if (sources.includes('research')) return 1;
  return 2;
}

// Dedupe questions across phases by normalized text; keep the first display text
// in spec>research>intake priority; order items spec-sourced first, then
// research-only, then intake-only (stable within a bucket).
export function consolidateOpenQuestions({ intake, research, spec } = {}) {
  const byPhase = {
    intake: extractOpenQuestions(intake || ''),
    research: extractOpenQuestions(research || ''),
    spec: extractOpenQuestions(spec || ''),
  };

  const merged = new Map();
  let order = 0;
  for (const phase of PHASE_PRIORITY) {
    for (const text of byPhase[phase]) {
      const key = normalizeQuestion(text);
      const existing = merged.get(key);
      if (existing) {
        if (!existing.sources.includes(phase)) existing.sources.push(phase);
      } else {
        merged.set(key, { text, sources: [phase], order: order++ });
      }
    }
  }

  const items = [...merged.values()]
    .sort((a, b) => bucketRank(a.sources) - bucketRank(b.sources) || a.order - b.order)
    .map(({ text, sources }) => ({
      text,
      sources: PHASE_PRIORITY.filter((p) => sources.includes(p)),
    }));

  return { total: items.length, items, bySource: byPhase };
}

// --- Orchestration: the CLI the harness invokes at the gate-A yield ----------

const ARTIFACT_SUBDIRS = { intake: 'intake', research: 'research', spec: 'specs' };

// Same slug shape the rest of the harness enforces (seed-tasklist.mjs). Rejecting
// anything else at the CLI boundary keeps a crafted `--slug` from traversing out
// of docs/{intake,research,specs}/ into an arbitrary `.md` file (CWE-22).
const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;

function readArtifact(dir, sub, slug) {
  try {
    return readFileSync(join(dir, 'docs', sub, `${slug}.md`), 'utf8');
  } catch {
    return null;
  }
}

function renderSurface(slug, consolidated) {
  if (consolidated.total === 0) {
    return `No open questions found across intake/research/spec for \`${slug}\`.`;
  }
  const lines = [`### Open questions to resolve before approving \`${slug}\` (${consolidated.total})`, ''];
  for (const item of consolidated.items) {
    lines.push(`- [${item.sources.join(', ')}] ${item.text}`);
  }
  return lines.join('\n');
}

function main(argv) {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      options: { slug: { type: 'string' }, dir: { type: 'string' } },
    });
  } catch (e) {
    process.stderr.write(`consolidate-open-questions: ${e.message}\n`);
    return 2;
  }
  const slug = parsed.values.slug;
  if (!slug) {
    process.stderr.write('consolidate-open-questions: --slug is required\n');
    return 2;
  }
  if (!SLUG_RE.test(slug)) {
    process.stderr.write(`consolidate-open-questions: invalid --slug '${slug}' (must match ${SLUG_RE})\n`);
    return 2;
  }
  const dir = parsed.values.dir || process.cwd();
  const consolidated = consolidateOpenQuestions({
    intake: readArtifact(dir, ARTIFACT_SUBDIRS.intake, slug),
    research: readArtifact(dir, ARTIFACT_SUBDIRS.research, slug),
    spec: readArtifact(dir, ARTIFACT_SUBDIRS.spec, slug),
  });
  process.stdout.write(renderSurface(slug, consolidated) + '\n');
  return 0;
}

const invokedDirectly =
  process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
if (invokedDirectly) {
  process.exit(main(process.argv.slice(2)));
}
