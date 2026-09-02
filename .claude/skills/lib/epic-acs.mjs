// Foundation — the shape of `slices[].acs` in an epic state file.
//
// The field has one reader (spec-lint's sliceOwnershipInState, which treats
// every element as an AC id) and two writers, one of which is Claude executing
// a paragraph of SKILL.md prose by hand. Measured at 02f3c68: two of six state
// files on disk hold ids, four hold whole criterion sentences, and the reader
// reported each sentence as an AC the spec failed to assign. seed.md §18.9
// publishes the required shape; this module is what the writer asserts against.

const AC_ID_RE = /^AC-\d+$/;

/** Whether every element of `acs` is an `AC-NNN` id. */
export function isAcIdShape(acs) {
  return Array.isArray(acs) && acs.every((entry) => AC_ID_RE.test(String(entry)));
}

/** The elements that are not `AC-NNN` ids. Empty for a well-shaped array. */
export function offendingAcs(acs) {
  if (!Array.isArray(acs)) return [];
  return acs.filter((entry) => !AC_ID_RE.test(String(entry)));
}

/**
 * Reject a `slices[].acs` array holding anything but AC ids, naming the field
 * and the first offending value. Called at the write so a prose-shaped array
 * never reaches the reader that would misreport it.
 */
export function assertAcIdShape(acs, field) {
  if (!Array.isArray(acs)) {
    throw new TypeError(`epic-acs: ${field} must be an array of AC-NNN ids, got ${typeof acs}`);
  }
  const [first] = offendingAcs(acs);
  if (first !== undefined) {
    throw new Error(
      `epic-acs: ${field} must hold AC-NNN ids, not criterion prose — got ${JSON.stringify(String(first).slice(0, 60))}`,
    );
  }
}

export { AC_ID_RE };
