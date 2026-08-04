// Foundation — how a memory entry's body splits into the three parts every
// surfacing leg presents.
//
// The split is Article IX.6 made mechanical: `>` lines are the speaker's VERBATIM
// and are canonical; everything else is Claude's interpretation and is subordinate.
// Both surfacing triggers — phase-scoped and path-governed — must present them the
// same way, so the parsing lives here rather than once per leg.

function bodyLines(body) {
  return String(body ?? '').split('\n');
}

export function extractVerbatim(body) {
  return bodyLines(body)
    .filter((line) => line.trim().startsWith('>'))
    .map((line) => line.replace(/^\s*>\s?/, ''))
    .join('\n')
    .trim();
}

export function extractInterpretation(body) {
  return bodyLines(body)
    .filter((line) => !line.trim().startsWith('>'))
    .join('\n')
    .trim();
}

// The first substantive line — what an index row shows when the full body would
// bury the reader.
export function firstHook(body) {
  for (const line of bodyLines(body)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('>') || trimmed.startsWith('#')) continue;
    return trimmed.replace(/^-\s*/, '');
  }
  return '';
}
