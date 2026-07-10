# Security reports — co-d-notifier

## co-d-notifier-2026-07-10.md

# Security Review — co-d-notifier — 2026-07-10

## Summary

Overall risk: **LOW**. The CO-D notifier spawns OS notifier binaries with a message derived from `harness_state.reason` + `slug`, but the injection surface is closed by construction: `spawnSync` is argv-based (no shell), the AppleScript and PowerShell string interpolations are correctly escaped, and the interpolated values are harness-templated / kebab-sanitized rather than untrusted input. No new dependency, no secrets in the payload, fail-safe error handling. One LOW correctness observation (Windows timing) is noted for a follow-up.

## Findings

### [LOW] Native-notifier message interpolation relies on escaping (defense-in-depth, not reachable)

- **OWASP**: A03 Injection | **CWE**: CWE-78 (OS command / script injection), defense-in-depth
- **File**: `.claude/skills/harness/notify.mjs:38-50, 56, 73`
- **Evidence**:
  ```js
  function asAppleScriptString(text) {
    return `"${String(text).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
  }
  // balloonScript: const b = String(body).replace(/'/g, "''");
  const result = spawnSync(cmd, rest, { timeout: 5000, stdio: 'ignore' });
  ```
- **Impact**: If an attacker could place raw AppleScript/PowerShell metacharacters into `harness_state.reason` or `slug`, a crafted payload could try to break out of the notification string (e.g. AppleScript `" & (do shell script "...")`). In practice this is **not reachable**: (1) `spawnSync` runs with no `shell: true`, so no shell metacharacter is ever interpreted; (2) the osascript argument is a single AppleScript string with backslash-then-quote escaping — a `"` becomes `\"`, so the string cannot be closed; (3) the PowerShell `-Command` interpolates only into single-quoted literals with `'`→`''` doubling, the correct PS escape; (4) `slug` is kebab-sanitized by `/triage` (`[a-z0-9-]`) and `reason` is composed from fixed harness templates ("yielded at /approve-spec", "&lt;phase&gt; failed: …") — neither carries attacker-controlled metacharacters. Severity is LOW because the escaping is defense-in-depth over an already-trusted, constrained input.
- **Recommendation**: No change required. Keep the escaping (it is correct and worth retaining as defense-in-depth). If `reason` ever begins to carry free-form untrusted text, re-rate.

## Dependencies

No new dependency. `package.json` dependencies remain `{"@clack/prompts":"1.4.0"}`; `notify.mjs` imports only Node stdlib (`node:fs`, `node:path`, `node:os`, `node:child_process`, `node:url`). No `npm audit` surface change. U6 (dependency-light) satisfied.

## Out of scope / Noted

- **[LOW correctness, not security] Windows balloon timing — FIXED in this cut.** `balloonScript` originally slept 6000 ms while `deliver` used a 5000 ms `spawnSync` timeout, so the win32 path always timed out → double-fired (balloon + terminal fallback) and misreported the channel. Fixed by lowering the balloon to `ShowBalloonTip(3000, …)` + `Start-Sleep -Milliseconds 2500` — comfortably under the 5 s timeout, so `spawnSync` returns cleanly with `status 0` and the channel is reported as `powershell`, no double-fire. Re-verified: 17/17 unit tests + audit PASS after the change.
- **Fail-safe confirmed.** `emit` swallows all errors and returns 0 by design — correct for a notifier (it must never stall the harness loop). It masks no security-relevant success criterion; a failed notification is logged best-effort to the harness log and is not a security event.
- **No secrets** in the notification body (slug + templated reason only). No log injection — `logLine` writes fixed messages with a channel/state from a closed set.

## Addendum — click-to-focus via terminal-notifier (spec amendment, AC-007)

Overall risk unchanged: **LOW**. The added macOS click-to-focus rung is *safer* than the existing native channels, not riskier:

- **No string-injection surface.** `terminal-notifier` receives the title and body as **separate argv elements** (`-title <t> -message <b>`), like `notify-send` — there is no AppleScript/PowerShell program string to escape, so the osascript/powershell interpolation concern does not apply here at all.
- **`-activate` value is whitelisted, not passed through.** The bundle id comes from `bundleIdFor($TERM_PROGRAM)` (`notify.mjs:` `TERMINAL_BUNDLE_IDS` lookup), which returns only one of a fixed set of known bundle ids or `null`. An attacker-controlled `TERM_PROGRAM` cannot inject an arbitrary `-activate` target — an unknown value maps to `null` and `-activate` is omitted entirely. CWE-88 (argument injection) is closed by the whitelist.
- **Still argv-based, still probed/optional.** `spawnSync` has no `shell:true`; `terminal-notifier` is used only if `onPath('terminal-notifier')` is true, adds no `package.json` dependency (U6 intact), and degrades to `osascript` when absent.
- **No new dependency, no secrets, fail-safe unchanged.** Verified live: on a Mac without `terminal-notifier`, delivery correctly fell through to `osascript`.

