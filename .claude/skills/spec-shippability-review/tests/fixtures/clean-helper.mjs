// Fixture for scan-shipped-skills-helper-files.test.mjs — clean helper that
// must produce ZERO findings even under the hardened scanner. Imports only
// from node:* builtins and a sibling path. No dev-tree references anywhere.

import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { neighborUtil } from './neighbor.js';

export async function fingerprint(path) {
  const buf = await readFile(path);
  return neighborUtil(createHash('sha256').update(buf).digest('hex'));
}
