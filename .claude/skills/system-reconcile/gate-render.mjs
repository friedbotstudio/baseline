// Foundation — turns a corpus report into the lines an operator reads.
//
// Split out of cli.mjs so the rendering can be exercised directly: that dispatcher
// runs `dispatch(...)` at module scope, so importing it executes the CLI and prints
// usage. A renderer nothing can import is a renderer nothing can test, and the one
// thing worth testing here is that a hostile record cannot forge the verdict.

import { clip } from '../lib/terminal-text.mjs';

export function countRows(data) {
  return Object.entries(data).map(([check, result]) => {
    const count = Array.isArray(result) ? result.length : Number(result ?? 0);
    return `${check}: ${count}`;
  });
}

// A member is a bare id from some checks and a verdict object from others, so it
// is named rather than interpolated — `${verdict}` renders as [object Object] and
// tells the operator nothing about which element breached.
//
// Clipped because every field here — id, element_id, path — is read from a record
// under docs/system/, and this line prints to a terminal. terminal-text.mjs's
// header states the consequence: an erase-line escape "wipes the line printed
// above it and forges a passing row", so an unsanitized member could show a reader
// a GATE PASSED line this gate never emitted. `clip` also bounds the length, which
// is what stops one absurd id from flooding the verdict.
export function memberLabel(member) {
  if (typeof member === 'string') return clip(member);
  return clip(member?.id ?? member?.element_id ?? member?.path ?? JSON.stringify(member));
}

export function gateVerdict(failures) {
  if (failures.length === 0) return ['', 'GATE PASSED'];
  return [
    '',
    'GATE FAILED',
    ...failures.map(({ section, members }) => `${section}: ${members.map(memberLabel).join(', ')}`),
  ];
}
