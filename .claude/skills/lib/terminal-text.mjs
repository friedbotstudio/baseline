// Foundation — the one place a repository-controlled string is made safe to print.
//
// Every consumer prints text the repository controls: commit subjects, roadmap
// titles, question bodies, backlog keys. Left raw, an erase-line escape in any of
// them wipes the line printed above it and forges a passing row.
//
// Controls are neutralised BEFORE the collapse, and the order is load-bearing:
// ESC and BEL are not whitespace, so `\s+` alone leaves them intact. Replacing
// them with a space first means the collapse then absorbs the gap behind them.
//
// The class is built from a string rather than written as a literal so the two
// consumers can be checked for a leftover local copy by searching for the literal
// form — a shared module with the old copies still in place is worse than either.

const CONTROL_CHARS = new RegExp('[\\u0000-\\u001f\\u007f-\\u009f]', 'gu');
const DEFAULT_WIDTH = 96;

export function clip(text, width = DEFAULT_WIDTH) {
  const flat = String(text ?? '').replace(CONTROL_CHARS, ' ').replace(/\s+/g, ' ').trim();
  return flat.length <= width ? flat : `${flat.slice(0, width - 1)}…`;
}
