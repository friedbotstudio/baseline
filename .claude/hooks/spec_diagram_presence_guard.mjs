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

import { existsSync } from 'node:fs';
import { basename, join, relative } from 'node:path';
import {
  CLAUDE_PROJECT_ROOT,
  readPayload,
  payloadGet,
  projectGet,
  emitAllow,
  emitBlock,
  computeProposedContent,
} from './lib/common.mjs';
import { assertSafeSlug } from './lib/slug.mjs';
import { resolveProfile } from './lib/write-set-profile.mjs';
import { STRUCTURAL_KINDS, elementReferences } from './lib/corpus-reference.mjs';
import { plantumlBlocks, missingKinds } from './lib/plantuml-blocks.mjs';

const payload = await readPayload();

const tool = payloadGet(payload, '.tool_name');
if (!['Write', 'Edit', 'MultiEdit'].includes(tool)) emitAllow();

const file = payloadGet(payload, '.tool_input.file_path');
if (!file) emitAllow();
const rel = relative(CLAUDE_PROJECT_ROOT, file) || file;

if (!(rel.startsWith('docs/specs/') && rel.endsWith('.md'))) emitAllow();

const base = basename(rel);
if (base.startsWith('_TEMPLATE_') || /TEMPLATE.*\.md$/.test(base)) emitAllow();

const content = computeProposedContent(tool, payload, file);
if (!content.trim()) emitAllow();

const profile = resolveProfile(content, projectGet);
const required = profile.required_diagrams;
if (!required || typeof required !== 'object' || Array.isArray(required)) emitAllow();

// Fence extraction and the kind-match rule are shared with /spec-lint so the
// guard and its preflight cannot drift on the same bytes.
const missing = missingKinds(plantumlBlocks(content), required);

// Spec-as-diff: a reference to a corpus element stands in for the STRUCTURAL kinds,
// which are exactly what the corpus models. Behavioural kinds still have to be drawn
// — a sequence describes this change, not the system's standing shape.
const references = elementReferences(content);

if (references.length) {
  const projectRoot = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const unresolved = references.filter((id) => {
    // REJECT before building a path (CWE-22); the regex above already bounds the id,
    // so this is the second gate rather than the only one.
    try {
      assertSafeSlug(id, 'corpus reference');
    } catch {
      return true;
    }
    return !existsSync(join(projectRoot, 'docs', 'system', 'elements', `${id}.md`));
  });

  if (unresolved.length) {
    emitBlock(
      `Spec Diagram Presence Guard: '${rel}' references corpus elements that do not exist: ${unresolved.join(', ')}.\n`
      + 'A reference stands in for a diagram, so an unresolvable one leaves the spec claiming a model that is not there.\n'
      + 'Check docs/system/elements/ for the element id, or draw the diagram instead.',
    );
  }

  for (let i = missing.length - 1; i >= 0; i -= 1) {
    if (STRUCTURAL_KINDS.has(missing[i].kind)) missing.splice(i, 1);
  }
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
// Without this the author sees only the missing kinds and never learns a typo
// refused their reduction.
if (profile.reason) lines.push(`The full set was required because of a ${profile.reason}.`);

emitBlock(lines.join('\n'));
