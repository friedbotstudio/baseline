// Foundation: any id that flows into a filesystem path or state key must be a
// safe charset — no path separators, no `..` traversal, no NUL. This closes the
// CWE-22 vector where a peer-supplied task_id/peer_id/sprint_id reaches a path
// (the lock dir, and the server's channelRoot resolution). Mirrors the slug
// guard the slice-A oracle uses.

export const SAFE_ID = /^[A-Za-z0-9_-]+$/;

export function isSafeId(id) {
  return typeof id === 'string' && SAFE_ID.test(id);
}
