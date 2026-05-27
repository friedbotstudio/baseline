#!/usr/bin/env node
// Spec Design Calls Guard — PreToolUse(Write|Edit|MultiEdit)
//
// When a spec's write_set intersects `project.json → tdd.ui_globs`, the spec
// MUST declare a `## Design calls` section with at least one populated row.
//
// Conditional firing:
//   - SKIP (allow): tdd.ui_globs empty or missing.
//   - SKIP (allow): write_set ∩ ui_globs is empty (no UI files in the spec).
//   - DENY: write_set has UI files AND no `## Design calls` section / empty body.
//   - ALLOW: write_set has UI files AND `## Design calls` has a populated row.

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

// Find the `## Design calls` section and verify it has a populated row.
const dc = /^##\s+Design\s+calls\s*$([\s\S]*?)(?=^##\s|$(?![\s\S]))/im.exec(content);
const body = dc ? dc[1].trim() : '';

function isPopulated(text) {
  const rows = text.split(/\r?\n/).filter((ln) => /^\s*\|/.test(ln) && !/^\s*\|[\s:-]+\|/.test(ln));
  if (rows.length < 2) return false;
  return rows.slice(1).some((r) => {
    const cleaned = r.replace(/^\s*\|/, '').replace(/\|\s*$/, '').trim();
    return !/^-?\s*\*?\(?none\)?\*?\s*$/i.test(cleaned);
  });
}

if (dc && isPopulated(body)) emitAllow();

const sorted = [...uiHits].sort();
emitBlock([
  `Spec Design Calls Guard: '${rel}' has UI files in its write_set but lacks a populated \`## Design calls\` section.`,
  `  UI files detected: ${sorted.join(', ')}`,
  '  The `## Design calls` section is required when the spec\'s write_set intersects `project.json → tdd.ui_globs`.',
  '  See `.claude/skills/spec/template.md` for the canonical Design calls table shape.',
  '  See CLAUDE.md Article X.2 for the routing rule.',
].join('\n'));
