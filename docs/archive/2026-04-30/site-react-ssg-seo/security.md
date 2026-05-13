# Security reports — site-react-ssg-seo

## site-react-ssg-seo-2026-04-29.md

# Security Review — site-react-ssg-seo — 2026-04-29

## Summary

Overall risk: **LOW**. The site is a static Astro 5 + React 19 + MDX project deployed behind nginx — no backend, no auth, no database, no user-supplied input at runtime, no secrets in tree, no third-party scripts loaded by emitted HTML. The narrow threat surface is the build-time tools, the deployment template (`nginx.sample.conf`), the supply chain (newly added devDependencies), and one defensive-coding gap in JSON-LD serialization. **Two MEDIUM** findings (nginx security-headers omission, JSON-LD `</script>` escape), **three LOW** findings, all straightforward to address.

No git is initialized in this repo, so the review covers the swarm-produced files under `site/` (the entire branch surface) plus modifications to `package.json`, `.gitignore`, and `.claude/project.json` from T-001.

## Findings

### [MEDIUM] nginx.sample.conf omits standard security response headers
- **OWASP**: A05 — Security Misconfiguration | **CWE**: CWE-693 (Protection Mechanism Failure)
- **File**: `site/tools/nginx.sample.conf:13-62`
- **Evidence**:
  ```nginx
  server {
      listen 80;
      listen [::]:80;
      server_name _;

      root {{DOC_ROOT}};
      index index.html;
      ...
      location / {
          try_files $uri $uri/ =404;
      }
  ```
- **Impact**: The deployment template ships **no** `X-Content-Type-Options`, `X-Frame-Options` (or CSP `frame-ancestors`), or `Referrer-Policy`. An operator who copies this verbatim gets a site that allows MIME-sniffing attacks, can be embedded in a clickjacking iframe, and leaks full referrer URLs cross-origin. The site itself has no auth so the *direct* impact is limited (no session to hijack via clickjacking, no privileged content), but the headers are conventional defaults that operators expect from a sample config and protect users browsing from compromised pages elsewhere.
- **Recommendation**: Add a header block scoped to `location /`:
  ```nginx
  add_header X-Content-Type-Options "nosniff" always;
  add_header X-Frame-Options "SAMEORIGIN" always;
  add_header Referrer-Policy "strict-origin-when-cross-origin" always;
  add_header Cross-Origin-Opener-Policy "same-origin" always;
  ```
  A `Content-Security-Policy` is harder to ship as a one-size-fits-all sample because the React islands' inline-style strategy makes a strict CSP impractical without per-build nonces. Document this trade-off in the conf comments and let the operator adopt CSP after profiling actual emissions.

### [MEDIUM] JSON-LD `set:html` does not escape `</script>` sequences
- **OWASP**: A03 — Injection (XSS variant via script-tag breakout) | **CWE**: CWE-79
- **File**: `site/src/layouts/Page.astro:57-59`
- **Evidence**:
  ```astro
  {jsonLdBlocks.map((block) => (
    <script type="application/ld+json" set:html={JSON.stringify(block)} />
  ))}
  ```
- **Impact**: `JSON.stringify` does not escape `<`/`>` characters by default. If any string field inside a JSON-LD block contains the substring `</script>` (or `<!--`, `<![CDATA[`), a browser closes the surrounding `<script>` tag prematurely and treats subsequent bytes as HTML — a classic stored-XSS-via-JSON pattern.

  At present this is latent, not exploitable: every JSON-LD block currently emitted comes from static constants in source (`SITE_NAME`, `DESCRIPTION`, etc.) and contains no `</script>` substring. The exposure activates the moment user-mutable content (MDX frontmatter `description`, future commit messages, etc.) feeds into a JSON-LD field. Spec AC-004 contemplates per-page JSON-LD generation, so this is the natural growth path.
- **Recommendation**: Replace the four characters that can break out of a `<script>` block at the serialization boundary. One-liner inside `Page.astro`:
  ```js
  const safeJsonLd = (obj) => JSON.stringify(obj)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/ /g, '\\u2028')
    .replace(/ /g, '\\u2029');
  ```
  Then `<script type="application/ld+json" set:html={safeJsonLd(block)} />`. The escaped `<` form remains valid JSON and Google's structured-data parser handles it correctly. The ` ` / ` ` escapes are the standard JSON-in-HTML defense against line-separator characters being interpreted as line terminators in old JS engines (defense-in-depth; modern engines handle this correctly inside JSON, but the pattern is conventional).

### [LOW] nginx.sample.conf has no HTTPS / HSTS / port-80→443 redirect
- **OWASP**: A02 — Cryptographic Failures (transport) | **CWE**: CWE-319 (Cleartext Transmission)
- **File**: `site/tools/nginx.sample.conf:14-15`
- **Evidence**:
  ```nginx
  listen 80;
  listen [::]:80;
  ```
- **Impact**: The sample only listens on plain HTTP. An operator deploying it verbatim ships an HTTP-only site; the marketing surface is interceptable on hostile networks. For a marketing/docs site the secrets-leakage surface is zero, but the *trust* signal of HTTPS is conventional.
- **Recommendation**: Add a commented-out HTTPS server block + redirect block in the sample, keyed off operator-substituted certificate paths:
  ```nginx
  # Uncomment after provisioning a cert (e.g., via certbot):
  # server {
  #   listen 443 ssl http2;
  #   listen [::]:443 ssl http2;
  #   server_name {{HOSTNAME}};
  #   ssl_certificate     /etc/letsencrypt/live/{{HOSTNAME}}/fullchain.pem;
  #   ssl_certificate_key /etc/letsencrypt/live/{{HOSTNAME}}/privkey.pem;
  #   add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
  #   ...same body as the :80 server...
  # }
  # server {
  #   listen 80;
  #   server_name {{HOSTNAME}};
  #   return 301 https://$host$request_uri;
  # }
  ```
  Include `Strict-Transport-Security` only inside the HTTPS block (HSTS over plain HTTP is meaningless / undefined).

### [LOW] `process.env.SITE_URL` is a build-time injection point with no validation
- **OWASP**: A04 — Insecure Design (build-environment trust) | **CWE**: CWE-20 (Improper Input Validation)
- **File**: `site/astro.config.mjs:7`, propagated via `site/src/seo/siteUrl.ts:4` and emitted into `<link rel="canonical">`, `<meta property="og:url">`, JSON-LD `url` fields, sitemap `<loc>`, robots.txt `Sitemap:` reference.
- **Evidence**:
  ```js
  site: process.env.SITE_URL || 'https://baseline.local',
  ```
- **Impact**: An attacker who controls the build environment (CI pipeline, malicious npm post-install hook, hijacked CI runner) can set `SITE_URL` to a value of their choosing and the resulting canonical/OG/sitemap URLs will all reflect it. This is a supply-chain / build-pipeline threat, not a runtime threat — once dist is built and signed/deployed, the URLs are fixed. Risk depends entirely on operator hygiene around CI secrets and reproducible builds.
- **Recommendation**: Two cheap defenses, neither of which the current spec requires:
  1. Validate the env var early in `astro.config.mjs`: assert it parses as a `URL`, has scheme `https:` (or `http:` for local), and reject anything else with a clear error rather than silently using it.
     ```js
     const siteUrl = process.env.SITE_URL || 'https://baseline.local';
     try { new URL(siteUrl); } catch { throw new Error(`Invalid SITE_URL: ${siteUrl}`); }
     ```
  2. Run `tools/check-determinism.sh` in CI as the canonical "matches reference build" check, after fixing `SITE_URL` for the canary build. The deterministic-build property already documented in AC-007 is the structural defense — CI just has to actually use it.

### [LOW] CopyButton silently swallows clipboard failures with no UI signal
- **OWASP**: not a Top-10 finding | **CWE**: CWE-754 (Improper Check for Unusual or Exceptional Conditions) — informational
- **File**: `site/src/components/islands/CopyButton.tsx:24-26`
- **Evidence**:
  ```tsx
  } catch {
    // navigator.clipboard may be unavailable (insecure context); silently no-op.
  }
  ```
- **Impact**: When `navigator.clipboard.writeText` rejects (insecure context, denied permission, third-party iframe sandbox), the button reports no feedback. The user clicks, sees nothing change, and may believe the copy succeeded. There is no security exposure (no leaked data, no auth bypass), but it is an integrity/UX concern: users believe state changed when it did not.
- **Recommendation**: Surface the failure in the UI — either show a `Copy failed` label briefly, or fall back to selecting the text in a hidden `<input>` / `<textarea>` so the user can copy via OS shortcut. Defer the visual decision to the `/document` phase or a follow-up UI pass; flagging here so it isn't lost.

## Dependencies

New devDependencies introduced by T-001 (declared in `site/package.json`):

| Package | Pinned | Notes |
|---|---|---|
| `astro@^5` | `^5.0.0` | current major; actively maintained by withastro. No public CVE on `^5` series at time of review. |
| `@astrojs/react@^4` | `^4.0.0` | matches Astro 5; no public CVE. |
| `@astrojs/mdx@^4` | `^4.0.0` | matches Astro 5; no public CVE. |
| `@astrojs/sitemap@^3` | `^3.0.0` | small surface; no public CVE. |
| `react@^19` | `^19.0.0` | current major. |
| `react-dom@^19` | `^19.0.0` | current major. |
| `@types/react@^19`, `@types/react-dom@^19` | `^19.0.0` | type-only; no runtime risk. |
| `@fontsource/plus-jakarta-sans@^5` | `^5.0.0` | CSS + font binaries; minimal exec surface. |
| `@fontsource/inter@^5` | `^5.0.0` | same. |

`npm audit` was not run because no `npm install` has been performed in this branch (lockfile-empty state; this is intentional per spec — the `/integrate` phase is when install happens). When `/integrate` runs `npm install`, run `npm audit --omit=dev=false` against the resulting lockfile and incorporate results into that phase's verdict.

## Out of scope / Noted

- `og/default.png` is a 1×1 transparent placeholder PNG (70 bytes). Not a security finding; flagged for the `/document` phase to either author a real 1200×630 OG image or accept the placeholder.
- `site/src/styles/global.css` `@import` chain (8 imports including font weights). Performance, not security. Already noted by the efficiency reviewer and explicitly deferred.
- Hook count claims and skill count claims in MDX content — verified at `/simplify` against CLAUDE.md (19 hooks, 36 skills, 11 phases). Not a security concern; flagged as content-truth invariant.
- `DevWindow.astro` accepts a slot for code content. Slot content comes from the parent page and is currently a static string. If a future page wires user-supplied content into a DevWindow slot, re-review for HTML injection — Astro's default slot rendering preserves content faithfully, including any tags.
- All four plate components (PipelineSubway, MemoryFlowPlate, HookBoundaryGrid, SkillCatalog) use `dangerouslySetInnerHTML={{__html: STYLES}}` with module-scope static `STYLES` strings. Static input → no XSS surface. Flagged so future edits that splice variables into these strings are caught.
- No CSP, COEP, or CORP headers in `nginx.sample.conf`. A defensible CSP for this site would be `default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self'; img-src 'self' data:`. The `'unsafe-inline'` for styles is required while the plate components ship `<style dangerouslySetInnerHTML>` blocks; a follow-up cleanup that moves those into static CSS files would tighten this. Track for a future hardening pass.

---

**Review verdict**: only LOW + MEDIUM findings; no CRITICAL or HIGH. Per skill flow, the security phase may be marked complete. Recommend addressing the two MEDIUMs (nginx headers, JSON-LD escape) in a follow-up patch before public deployment, but they do not block `/integrate`.

