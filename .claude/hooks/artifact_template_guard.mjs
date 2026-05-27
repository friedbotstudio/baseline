#!/usr/bin/env node
// Artifact Template Guard — PreToolUse(Write|Edit|MultiEdit)
//
// Enforces that writes to docs/{intake,brd,specs,rca}/*.md include every
// required section heading for that artifact type. Required sections come
// from .claude/project.json → artifacts.required_sections.<type>.
//
// Template files (any basename starting with "_TEMPLATE_") are exempt.
// Empty/whitespace-only proposed content is allowed (touch/clear).
//
// The guard inspects *proposed content* (what the tool is about to write),
// not the file on disk.

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

let artifactType = null;
if (rel.startsWith('docs/intake/') && rel.endsWith('.md')) artifactType = 'intake';
else if (rel.startsWith('docs/brd/') && rel.endsWith('.md')) artifactType = 'brd';
else if (rel.startsWith('docs/specs/') && rel.endsWith('.md')) artifactType = 'spec';
else if (rel.startsWith('docs/rca/') && rel.endsWith('.md')) artifactType = 'rca';
if (!artifactType) emitAllow();

const base = basename(rel);
if (base.startsWith('_TEMPLATE_') || /TEMPLATE.*\.md$/.test(base)) emitAllow();

const required = projectGet(`.artifacts.required_sections.${artifactType}`);
if (!Array.isArray(required) || required.length === 0) emitAllow();

const content = computeProposedContent(tool, payload, file);
if (!content.trim()) emitAllow();

const norm = (s) => String(s).replace(/\s+/g, ' ').trim().toLowerCase().replace(/[:.]$/, '');

const headings = new Set();
for (const ln of content.split(/\r?\n/)) {
  const m = /^\s{0,3}#{2,4}\s+(.+?)\s*$/.exec(ln);
  if (m) headings.add(norm(m[1]));
}

const missing = required.filter((r) => !headings.has(norm(r)));
if (missing.length === 0) emitAllow();

emitBlock(`Artifact Template Guard: '${rel}' (${artifactType}) is missing required section(s): ${missing.join(', ')}. Use the \`${artifactType}\` skill at .claude/skills/${artifactType}/SKILL.md (template at .claude/skills/${artifactType}/template.md) to produce a compliant document. Every required heading must appear as a ## or ### heading.`);
