// Convert a root-style site path (e.g. `/foo/bar`) to a page-relative URL
// using the current page's URL to compute the right number of `../` steps.
// Used by the eleventy `rel` filter so a single deployed artifact serves
// correctly at any mount point — `/` (custom domain root), `/baseline/`
// (project-page URL), or any subpath we ever publish under.
//
// Inputs that pass through unchanged:
//   - empty / non-string                       → returned as-is
//   - fragment-only links (`#section`)         → in-page navigation
//   - protocol-relative (`//cdn.example.com/`) → cross-origin
//   - absolute URLs (`https://`, `mailto:`,    → external (regex matches
//     `data:`, `javascript:`, …)                  any scheme)
//   - already-relative paths (no leading `/`)  → idempotent
//
// For root-style inputs, depth is computed from `pageUrl` segments:
//   pageUrl = "/"             → depth 0 → prefix "./"     → "./assets/x"
//   pageUrl = "/cli/"         → depth 1 → prefix "../"    → "../assets/x"
//   pageUrl = "/skills/core/" → depth 2 → prefix "../../" → "../../assets/x"
//
// Edge case: when absPath is bare "/" (link back to site root), the
// returned form is just the prefix (`./` or `../`), which the browser
// resolves to the directory itself — i.e., the site root at any depth.
function relUrl(absPath, pageUrl) {
  if (typeof absPath !== 'string' || absPath.length === 0) return absPath;
  if (absPath.startsWith('#')) return absPath;
  if (absPath.startsWith('//')) return absPath;
  if (/^[a-z][a-z0-9+.-]*:/i.test(absPath)) return absPath;
  if (!absPath.startsWith('/')) return absPath;

  const url = pageUrl || '/';
  const depth = url.split('/').filter(Boolean).length;
  const prefix = depth === 0 ? './' : '../'.repeat(depth);
  return prefix + absPath.slice(1);
}

module.exports = { relUrl };
