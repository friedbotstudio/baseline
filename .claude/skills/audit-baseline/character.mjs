// Foundation — the one render rule for a skill's character block.
//
// The stamper writes through renderBlock and the audit check verifies through it.
// A second copy of the rule in either caller is a copy that drifts, and the drift
// check would then be comparing two wrongs (spec S-3).

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { assertSafeSlug } from '../../hooks/lib/slug.mjs';

const DOCTRINE_REL = '.claude/skills/audit-baseline/character.json';
const BEGIN = '<!-- character:begin -->';
const END = '<!-- character:end -->';
const PARTS = [['soul', 'Soul'], ['motivation', 'Motivation'], ['mantra', 'Mantra']];

export function loadDoctrine(rootDir) {
  const path = join(rootDir, DOCTRINE_REL);
  let raw;
  try {
    raw = readFileSync(path, 'utf8');
  } catch (cause) {
    throw new Error(`character doctrine unreadable at ${DOCTRINE_REL}`, { cause });
  }
  const parsed = JSON.parse(raw);
  if (!parsed || typeof parsed.skills !== 'object' || parsed.skills === null) {
    throw new Error(`character doctrine at ${DOCTRINE_REL} has no skills object`);
  }
  // REJECT the whole doctrine, never repair one key. Every consumer turns a key into
  // a path segment, and normalizing a traversing slug would silently write elsewhere
  // instead of failing — the CWE-22 rule plan-store already enforces.
  for (const slug of Object.keys(parsed.skills)) assertSafeSlug(slug);
  return parsed;
}

export function skillPathFor(rootDir, slug) {
  assertSafeSlug(slug);
  return join(rootDir, '.claude', 'skills', slug, 'SKILL.md');
}

export function renderBlock(entry) {
  const lines = [BEGIN, '', '## Character', ''];
  for (const [key, label] of PARTS) {
    const value = entry?.[key];
    if (typeof value !== 'string' || value.trim() === '') {
      throw new Error(`character entry is missing ${key}`);
    }
    lines.push(`- **${label}.** ${value.trim()}`);
  }
  lines.push('', END, '');
  return lines.join('\n');
}

export function extractBlock(skillMdText) {
  const lines = String(skillMdText).split('\n');
  const startLine = lines.indexOf(BEGIN);
  if (startLine === -1) return null;
  const endLine = lines.indexOf(END, startLine);
  if (endLine === -1) return null;
  return { text: `${lines.slice(startLine, endLine + 1).join('\n')}\n`, startLine, endLine };
}

export function stampSkill(skillMdText, blockText) {
  const lines = String(skillMdText).split('\n');
  const existing = extractBlock(skillMdText);
  if (existing) {
    return replaceRange(lines, existing.startLine, existing.endLine, blockText);
  }
  return insertAfterFrontmatter(lines, blockText);
}

function replaceRange(lines, startLine, endLine, blockText) {
  const block = blockText.replace(/\n$/, '').split('\n');
  return [...lines.slice(0, startLine), ...block, ...lines.slice(endLine + 1)].join('\n');
}

function insertAfterFrontmatter(lines, blockText) {
  const closing = closingFenceIndex(lines);
  const block = blockText.replace(/\n$/, '').split('\n');
  return [...lines.slice(0, closing + 1), '', ...block, ...lines.slice(closing + 1)].join('\n');
}

function closingFenceIndex(lines) {
  if (lines[0]?.trim() !== '---') {
    throw new Error('no frontmatter fence — a target with no fence has no insertion point');
  }
  const closing = lines.indexOf('---', 1);
  if (closing === -1) {
    throw new Error('no frontmatter fence — the opening --- is never closed');
  }
  return closing;
}
