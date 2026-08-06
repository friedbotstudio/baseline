// Foundation — what falsifies a durable diagram.
//
// Supersedes architecture-map D2. That decision limited the durable corpus to a
// KIND WHITELIST — structure and validator-backed data shapes, with sequence,
// activity, BPMN, timing and use-case excluded. Its stated rationale was
// falsifiability: "a diagram the reconcile pass can check against code can be kept
// honest; one it cannot is a claim nobody can falsify." The whitelist was a proxy
// for that property, forced by `anchor_digest` covering an exported-symbol surface
// that behavioural diagrams do not have.
//
// Tests are that missing surface, so the property is enforced directly now:
//
//   anchor-digest — the structural interface hash already in digest.mjs
//   test          — a named test that must resolve and pass
//   none          — nothing checks it; permitted, but never citable as evidence
//
// The `none` tier is deliberate, not a loophole. Baseline installs into other
// people's repositories, and a project whose domain is a business process needs to
// model it. Permitting the diagram while marking it unwitnessed is more honest than
// excluding it (the model lies by omission) or pretending it is checked.

import { readProjectConfig } from './surface.mjs';

const UNWITNESSED = { witness: 'none', target: null };

function readWitnesses(rootDir) {
  return readProjectConfig(rootDir)?.memory?.architecture_map?.witnesses ?? null;
}

// An unregistered kind binds `none` rather than throwing: a project may draw
// anything, and refusing an unknown kind would make the registry a whitelist again
// — the exact shape this decision replaced.
export function bindingFor(kind, { rootDir = process.cwd() } = {}) {
  if (!kind) return { ...UNWITNESSED };
  const registry = readWitnesses(rootDir);
  const entry = registry?.[kind];
  if (!entry || typeof entry !== 'object') return { ...UNWITNESSED };
  return { witness: entry.witness ?? 'none', target: entry.target ?? null };
}

// Only a witnessed diagram may be cited as evidence (amended D8). The original rule
// forbade citing ANY generated view, on the assumption nothing could check one;
// once something does, the assumption no longer holds for that diagram.
export function isCitable(witness) {
  return witness === 'anchor-digest' || witness === 'test';
}
