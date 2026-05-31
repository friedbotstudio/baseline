// CHANGELOG.md curation under ## [Unreleased].
//
// Two exports:
//   appendUnderUnreleased(changelogPath, entries) — per-commit RMW.
//   reinsertUnreleasedHeading(changelogPath)       — AC-013 fallback for the
//     case where @semantic-release/changelog has prepended versioned notes
//     above the `# Changelog` and `## [Unreleased]` headings. Restores the
//     canonical order: `# Changelog\n\n## [Unreleased]\n\n<rest>`.
//
// File shape we maintain (keepachangelog 1.0.0):
//
//   # Changelog
//
//   ## [Unreleased]
//
//   ### Added
//   - <entry>
//
//   ### Fixed
//   - <entry>
//
//   ## [0.1.0] - 2026-01-01
//
//   ...

import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const UNRELEASED_HEADING = '## [Unreleased]';
const CHANGELOG_HEADING = '# Changelog';

const CATEGORY_ORDER = ['Added', 'Changed', 'Deprecated', 'Removed', 'Fixed', 'Security'];

// Index of `heading` ONLY where it occupies a full line — never a prose mention
// (e.g. the intro paragraph "The `## [Unreleased]` section is curated…" quotes
// the heading in backticks). A bare `indexOf` matched that prose first and
// inserted entries above the real heading; anchoring to line-start fixes it.
function lineAnchoredIndex(text, heading) {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = new RegExp(`^${escaped}\\s*$`, 'm').exec(text);
  return m ? m.index : -1;
}
const hasLineAnchored = (text, heading) => lineAnchoredIndex(text, heading) >= 0;

function groupBySection(entries) {
  const map = new Map();
  for (const entry of entries) {
    if (!map.has(entry.section)) map.set(entry.section, []);
    map.get(entry.section).push(entry);
  }
  return map;
}

function renderUnreleasedBody(entries) {
  if (entries.length === 0) return '';
  const grouped = groupBySection(entries);
  const lines = [];
  for (const section of CATEGORY_ORDER) {
    const items = grouped.get(section);
    if (!items || items.length === 0) continue;
    lines.push('');
    lines.push(`### ${section}`);
    lines.push('');
    for (const item of items) {
      const prefix = item.breaking ? '**BREAKING:** ' : '';
      lines.push(`- ${prefix}${item.body}`);
    }
  }
  return lines.join('\n');
}

// Split text into { preamble, unreleasedBody, rest } where preamble is
// everything up to and including the `## [Unreleased]` line, unreleasedBody
// is the content between that and the next `##` heading, and rest is from
// the next `##` heading onward.
function splitAroundUnreleased(text) {
  const unreleasedIdx = lineAnchoredIndex(text, UNRELEASED_HEADING);
  if (unreleasedIdx < 0) return null;
  const afterHeading = text.indexOf('\n', unreleasedIdx);
  const headingEnd = afterHeading < 0 ? text.length : afterHeading + 1;
  // Find the next version-block heading after the Unreleased heading. Version
  // blocks are level-1 (`# [0.12.0]`, how @semantic-release writes minor/major)
  // OR level-2 (`## [0.8.2]`, how it writes patches). Match `# ` or `## ` but
  // NOT `### ` (a level-3 section header inside the Unreleased body), so the
  // body bound stops at the first version block instead of swallowing every
  // `# ` block down to the next `## ` — the data-loss bug (WF-4 defect 1).
  const restMatch = text.slice(headingEnd).match(/\n#{1,2} [^\n]+\n/);
  const restOffset = restMatch ? headingEnd + restMatch.index + 1 : text.length;
  return {
    preamble: text.slice(0, headingEnd),
    unreleasedBody: text.slice(headingEnd, restOffset),
    rest: text.slice(restOffset),
  };
}

function defaultChangelogText() {
  return `# Changelog\n\n## [Unreleased]\n\n`;
}

export async function appendUnderUnreleased(changelogPath, entries) {
  let text;
  if (existsSync(changelogPath)) {
    text = await readFile(changelogPath, 'utf8');
  } else {
    text = defaultChangelogText();
  }
  if (!hasLineAnchored(text, CHANGELOG_HEADING)) {
    text = `${CHANGELOG_HEADING}\n\n${text}`;
  }
  if (!hasLineAnchored(text, UNRELEASED_HEADING)) {
    text = text.replace(
      new RegExp(`(${CHANGELOG_HEADING}\\n)`, ''),
      `$1\n${UNRELEASED_HEADING}\n\n`,
    );
  }
  const parts = splitAroundUnreleased(text);
  if (!parts) {
    // Defensive: should be unreachable after the insertions above.
    throw new Error(`could not locate ${UNRELEASED_HEADING} in ${changelogPath}`);
  }
  const body = renderUnreleasedBody(entries);
  const merged = `${parts.preamble}${body}\n${parts.rest.startsWith('\n') ? parts.rest : '\n' + parts.rest}`;
  await writeFile(changelogPath, merged, 'utf8');
}

export async function reinsertUnreleasedHeading(changelogPath) {
  const text = await readFile(changelogPath, 'utf8');
  // If the first `##` heading in the file is already `## [Unreleased]`, the
  // file is structurally correct; do nothing.
  const firstH2 = text.match(/^## .+$/m);
  if (firstH2 && firstH2[0].includes('[Unreleased]')) {
    return;
  }
  // Otherwise: find the existing Unreleased heading (which may sit deeper in
  // the file because @semantic-release/changelog prepended notes above it)
  // and lift it to the canonical top position.
  const lines = text.split('\n');
  // Identify the Unreleased section's start and the next `##` start.
  let unreleasedStart = -1;
  let unreleasedEnd = -1;
  for (let i = 0; i < lines.length; i++) {
    if (unreleasedStart < 0 && lines[i] === UNRELEASED_HEADING) {
      unreleasedStart = i;
      continue;
    }
    if (unreleasedStart >= 0 && /^## /.test(lines[i])) {
      unreleasedEnd = i;
      break;
    }
  }
  if (unreleasedStart < 0) {
    // No Unreleased heading anywhere; insert a fresh one at the top.
    const top = `${CHANGELOG_HEADING}\n\n${UNRELEASED_HEADING}\n\n`;
    await writeFile(changelogPath, top + text, 'utf8');
    return;
  }
  if (unreleasedEnd < 0) unreleasedEnd = lines.length;
  const unreleasedBlock = lines.slice(unreleasedStart, unreleasedEnd);
  const without = lines.slice(0, unreleasedStart).concat(lines.slice(unreleasedEnd));
  // Strip any leading blank lines from the without-block so the result starts
  // with the `# Changelog` heading (we'll insert one if absent).
  const withoutText = without.join('\n');
  const head = withoutText.startsWith(CHANGELOG_HEADING)
    ? withoutText
    : `${CHANGELOG_HEADING}\n\n${withoutText.replace(/^\n+/, '')}`;
  const restored = head.replace(
    new RegExp(`^(${CHANGELOG_HEADING})\\n\\n?`),
    `$1\n\n${unreleasedBlock.join('\n')}\n\n`,
  );
  await writeFile(changelogPath, restored, 'utf8');
}
