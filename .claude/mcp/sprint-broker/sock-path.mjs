// Foundation: resolve the broker's Unix-domain socket rendezvous. An explicit
// $SPRINT_BROKER_SOCK always wins; otherwise fall back to a short path under the
// XDG runtime dir / TMPDIR / /tmp — deliberately OUTSIDE any repo clone, so peers in
// separate working trees reach the same broker. The UDS sun_path cap is ~104 bytes
// (macOS) / ~108 (linux); we throw above 100 BEFORE any bind so a deep clone path
// fails loud rather than truncating silently. node stdlib only.

import { join } from 'node:path';

const SUN_PATH_LIMIT = 100;

export function resolveSockPath({ env = {}, channel }) {
  if (env.SPRINT_BROKER_SOCK) return env.SPRINT_BROKER_SOCK;
  const dir = env.XDG_RUNTIME_DIR || env.TMPDIR || '/tmp';
  const path = join(dir, `sprint-broker-${channel}.sock`);
  if (Buffer.byteLength(path) > SUN_PATH_LIMIT) {
    throw new Error(`socket path too long (${Buffer.byteLength(path)} > ${SUN_PATH_LIMIT}): ${path}`);
  }
  return path;
}
