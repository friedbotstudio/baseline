// Foundation — the one assertion on the fan-out's input path that throws.
//
// Giving the input an owner was not enough on its own: the owner emitted bare path
// strings while `code-structure` and `backlog-deferral` read `file.content` and
// `file.path`, so both stayed vacuous with no error and no skip marker. Every other
// function on this path is fail-open by contract, which is exactly why that was silent.
//
// It lives apart from the assembler because it validates a type, not a git result — it
// reads no file, runs no command, and has no reason to change when a probe does.

export function assertChangedFilesShape(changedFiles) {
  if (!Array.isArray(changedFiles)) {
    throw new TypeError(`ctx.changedFiles must be an array of {path, content, prior}; got ${typeof changedFiles}`);
  }
  changedFiles.forEach((file, index) => {
    if (file === null || typeof file !== 'object') {
      throw new TypeError(
        `ctx.changedFiles[${index}] must be a {path, content, prior} object; got ${typeof file}`,
      );
    }
    for (const field of ['path', 'content']) {
      if (typeof file[field] !== 'string') {
        throw new TypeError(
          `ctx.changedFiles[${index}].${field} must be a string; got ${typeof file[field]}`,
        );
      }
    }
    if (file.prior !== null && typeof file.prior !== 'string') {
      throw new TypeError(
        `ctx.changedFiles[${index}].prior must be a string or null; got ${typeof file.prior}`,
      );
    }
  });
}
