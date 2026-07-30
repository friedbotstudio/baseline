// Foundation: any id that flows into a filesystem path or state key must be a
// safe charset — no path separators, no `..` traversal, no NUL. This closes the
// CWE-22 vector where a peer-supplied task_id/peer_id/sprint_id reaches a path
// (the lock dir, and the server's channelRoot resolution). Mirrors the slug
// guard the slice-A oracle uses.

export const SAFE_ID = /^[A-Za-z0-9_-]+$/;

// A charset-safe id can still be too LONG to be a path component. POSIX caps a
// component at 255 bytes, so an over-long id passed the charset guard and then
// threw ENAMETOOLONG from the lock mkdir — an unhandled filesystem exception
// instead of a clean rejection. 128 leaves room for the `task-<id>.lock.d`
// wrapper the lock builds around it.
export const MAX_ID_LENGTH = 128;

export function isSafeId(id) {
  return typeof id === 'string'
    && id.length <= MAX_ID_LENGTH
    && SAFE_ID.test(id);
}
