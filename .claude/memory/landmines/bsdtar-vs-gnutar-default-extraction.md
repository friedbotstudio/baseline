---
key: bsdtar-vs-gnutar-default-extraction
category: landmines
scope: [chore, integrate]
verified-at: 3c74ba8
last-touched: 2026-06-20
---

- The macOS default `tar` is `bsdtar` (libarchive); Linux/CI default is GNU `tar`. Both DEFAULT-reject absolute paths and `..` path components when extracting (bsdtar: "files containing components that resolve outside of the destination directory" are refused; GNU tar: strips leading `/` and warns). So a malicious tarball cannot write outside `-C tmp` on either platform with default flags.
- BUT the safety relies on the tar binary's default behavior. A custom-built tar, a future flag-default change, or a different tarball processor in the chain would re-expose path traversal. `src/cli/upgrade-tiers.js → extractFromTarball` adds an explicit `path.resolve(candidate).startsWith(tmpRoot + sep)` defense-in-depth check after extraction — throws `NoBaseError` with `kind: 'tarball_path_traversal'` on escape, which routes through the tier-1 binary-prompt fallback.
- Why it matters: the security review for `upgrade-flow-rework` (2026-05-20) initially rated this HIGH because BSD tar absolute-path handling had been mis-recalled. The actual bsdtar behavior is safe-by-default per man bsdtar; the explicit check makes the safety contract platform-agnostic and survives future tar-binary changes.
- Don't strip the defensive check thinking "tar handles it" — keep the belt-and-suspenders. Same principle applies to any future tarball/zip extraction code paths.
