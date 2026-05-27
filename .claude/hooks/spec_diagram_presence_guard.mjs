#!/usr/bin/env node
// Spec Diagram Presence Guard — PreToolUse(Write|Edit|MultiEdit)
//
// Enforces that docs/specs/*.md contains the diagram kinds required by the
// spec template. Complements artifact_template_guard (headings) and
// plantuml_syntax_guard (per-block syntax): this one ensures the right
// kinds of diagrams exist.
//
// Config: .claude/project.json → artifacts.required_diagrams.spec
//   Each entry is { "min": int (default 1), "marker": "literal", "any_of": [regex...] }
//
// A fenced ```plantuml``` block counts if it contains the literal marker OR
// any line matches any regex in any_of. Prose mentions don't satisfy.

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

const required = projectGet('.artifacts.required_diagrams.spec');
if (!required || typeof required !== 'object' || Array.isArray(required)) emitAllow();

const content = computeProposedContent(tool, payload, file);
if (!content.trim()) emitAllow();

// Extract bodies of ```plantuml``` fences (case-insensitive, multiline).
const fenceRe = /^[ \t]*```[ \t]*plantuml[ \t]*$([\s\S]*?)^[ \t]*```[ \t]*$/gmi;
const blocks = [];
let m;
while ((m = fenceRe.exec(content)) !== null) blocks.push(m[1]);

const blockMatches = (body, rule) => {
  if (rule.marker && body.includes(rule.marker)) return true;
  for (const pat of (rule.any_of || [])) {
    try {
      if (new RegExp(pat, 'm').test(body)) return true;
    } catch {}
  }
  return false;
};

const missing = [];
for (const [kind, rule] of Object.entries(required)) {
  if (!rule || typeof rule !== 'object') continue;
  const need = Number.isFinite(rule.min) ? Math.trunc(rule.min) : 1;
  const found = blocks.filter((b) => blockMatches(b, rule)).length;
  if (found < need) missing.push({ kind, need, found });
}

if (missing.length === 0) emitAllow();

const lines = [
  `Spec Diagram Presence Guard: '${rel}' is missing required diagram kinds. Each kind must appear inside a \`\`\`plantuml\`\`\` fence.`,
];
for (const { kind, need, found } of missing) {
  lines.push(`  - ${kind}: need ${need}, found ${found}`);
}
lines.push('See .claude/skills/spec/template.md for the canonical diagram skeletons (C4 Context/Container/Component, class, sequence, dependency graph).');
lines.push('Required kinds are configured at .claude/project.json → artifacts.required_diagrams.spec.');

emitBlock(lines.join('\n'));
