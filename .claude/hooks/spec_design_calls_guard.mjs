#!/usr/bin/env node
// Spec Design Calls Guard — PreToolUse(Write|Edit|MultiEdit)
//
// When a spec's write_set intersects `project.json → tdd.ui_globs`, every
// `## Design calls` row MUST declare a populated Reference target (the C4
// design-judge rubric) and Quality criteria (roadmap B1 quality floor). The
// rule lives in the shared lib/design-calls.mjs so spec-lint applies it too.
//
// Conditional firing:
//   - SKIP (allow): tdd.ui_globs empty or missing.
//   - SKIP (allow): write_set ∩ ui_globs is empty (no UI files in the spec).
//   - DENY: write_set has UI files AND (no populated `## Design calls` section
//           OR any row missing Reference target / Quality criteria).
//   - ALLOW: write_set has UI files AND every row carries both fields.

import { basename, relative } from 'node:path';
import {
  CLAUDE_PROJECT_ROOT,
  readPayload,
  payloadGet,
  projectGet,
  emitAllow,
  emitBlock,
  computeProposedContent,
} from './lib/common.mjs';
import { parseDesignCalls, findRowDefects } from './lib/design-calls.mjs';

const payload = await readPayload();

const tool = payloadGet(payload, '.tool_name');
if (!['Write', 'Edit', 'MultiEdit'].includes(tool)) emitAllow();

const file = payloadGet(payload, '.tool_input.file_path');
if (!file) emitAllow();
const rel = relative(CLAUDE_PROJECT_ROOT, file) || file;

if (!(rel.startsWith('docs/specs/') && rel.endsWith('.md'))) emitAllow();

const base = basename(rel);
if (base.startsWith('_TEMPLATE_') || /TEMPLATE.*\.md$/.test(base)) emitAllow();

const uiGlobs = projectGet('.tdd.ui_globs');
if (!Array.isArray(uiGlobs) || uiGlobs.length === 0) emitAllow();

const content = computeProposedContent(tool, payload, file);
if (!content.trim()) emitAllow();

// Brace expansion + glob → regex (local because matchAnyGlob doesn't expand {a,b,c}).
function expandBraces(globs) {
  const out = [];
  for (const g of globs) {
    if (!g.includes('{')) { out.push(g); continue; }
    const i = g.indexOf('{'), j = g.indexOf('}', i);
    if (j < 0) { out.push(g); continue; }
    const prefix = g.slice(0, i);
    const alts = g.slice(i + 1, j).split(',');
    const suffix = g.slice(j + 1);
    for (const a of alts) out.push(prefix + a.trim() + suffix);
  }
  return out;
}
function globToRegex(g) {
  let out = '';
  for (let i = 0; i < g.length; i++) {
    const c = g[i];
    if (c === '*') {
      if (g[i + 1] === '*') { out += '.*'; i++; }
      else out += '[^/]*';
    } else if (c === '?') out += '[^/]';
    else if ('.+()|^$\\[]{}'.includes(c)) out += '\\' + c;
    else out += c;
  }
  return new RegExp('^' + out + '$');
}
function matchesAnyGlob(path, globs) {
  for (const g of expandBraces(globs)) {
    if (globToRegex(g).test(path)) return true;
  }
  return false;
}

// Extract write_set paths from the spec body.
const writeSetPaths = new Set();
for (const line of content.split(/\r?\n/)) {
  const m = /write[_\s]set\s*:\s*(.+)$/i.exec(line);
  if (!m) continue;
  for (let tok of m[1].split(/[`,\s|]+/)) {
    tok = tok.trim().replace(/^\*+|\*+$/g, '').trim();
    if (tok && tok.includes('/') && !tok.startsWith('#')) writeSetPaths.add(tok);
  }
}

const uiHits = [...writeSetPaths].filter((p) => matchesAnyGlob(p, uiGlobs));
if (uiHits.length === 0) emitAllow();

// Validate the `## Design calls` section via the shared lib (single source of
// the quality-floor rule, shared with spec-lint so they never diverge).
const section = parseDesignCalls(content);
const sorted = [...uiHits].sort();

if (section.isNone || section.rows.length === 0) {
  emitBlock([
    `Spec Design Calls Guard: '${rel}' has UI files in its write_set but lacks a populated \`## Design calls\` section.`,
    `  UI files detected: ${sorted.join(', ')}`,
    '  The `## Design calls` section is required when the spec\'s write_set intersects `project.json → tdd.ui_globs`.',
    '  Each row needs a populated Reference target (the C4 design-judge rubric) and Quality criteria.',
    '  See `.claude/skills/spec/template.md` for the canonical Design calls table shape.',
    '  See CLAUDE.md Article X.2 for the routing rule.',
  ].join('\n'));
}

const defects = findRowDefects(section);
if (defects.length === 0) emitAllow();

emitBlock([
  `Spec Design Calls Guard: '${rel}' has UI files in its write_set but its \`## Design calls\` rows are incomplete.`,
  `  UI files detected: ${sorted.join(', ')}`,
  ...defects.map((d) => `  row '${d.slug}' missing: ${d.missing.join(', ')}`),
  '  Every UI-surface row needs a populated Reference target (the C4 design-judge rubric) and Quality criteria.',
  '  See `.claude/skills/spec/template.md` for the canonical Design calls table shape.',
].join('\n'));
