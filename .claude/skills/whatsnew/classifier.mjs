// The canonical keepachangelog 1.0.0 section set, in canonical order.
// fragment-writer.mjs validates each entry's `category` against this set.

export const KEEPACHANGELOG_SECTIONS = Object.freeze([
  'Added',
  'Changed',
  'Deprecated',
  'Removed',
  'Fixed',
  'Security',
]);
