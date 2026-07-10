# Security reports — notifier-on-stop

## notifier-on-stop-2026-07-10.md

# Security Review — notifier-on-stop — 2026-07-10

## Summary
LOW risk. The change adds a Stop-event notification mode (`emitStop`) plus three pure helpers to `.claude/skills/harness/notify.mjs`. It introduces **no new injection class**: the delivery edge (`deliver`) spawns via `spawnSync(cmd, argv, {stdio:'ignore'})` with an argv array and **no `shell:true`**, so no channel touches a shell. The new stdin read is parse-hardened (malformed → `{}`), and every tainted value (slug, config, marker path) is developer-controlled, not attacker-supplied. No CRITICAL/HIGH/MEDIUM findings.

## Findings

### [LOW] Notification body interpolates slug into per-notifier DSLs (defense-in-depth, already handled)
- **OWASP**: A03 - Injection | **CWE**: CWE-78 / CWE-116
- **File**: `.claude/skills/harness/notify.mjs:52` (`composeStopNotification`), delivered via `completeArgv` / `asAppleScriptString` / `balloonScript`
- **Evidence**:
  ```js
  const body = slug ? `${slug}: Claude is idle - your turn` : 'Claude is idle - your turn';
  // → osascript: asAppleScriptString escapes \ and "
  // → powershell: balloonScript escapes ' → ''
  // → notify-send / terminal-notifier: plain argv element
  // deliver(): spawnSync(cmd, rest, {timeout:5000, stdio:'ignore'})  // NO shell:true
  ```
- **Impact**: None reachable. `spawnSync` with an argv array bypasses the shell, so the slug cannot inject OS commands on any platform. It reaches only the AppleScript string literal (escaped for `\` and `"`) or the PowerShell single-quoted string (escaped `'`→`''`); a malformed slug at worst makes the target notifier error, which falls through to the terminal fallback (`deliver` catches non-zero/`error`). The slug is developer-controlled — written to `harness_state` by the harness, derived by `/triage` — so it is not an attacker-controlled boundary in the threat model.
- **Recommendation**: No change required. This is the same escaping path the pre-existing `composeNotification` (yield body) already uses; `emitStop` reuses it unchanged. Keep the argv-array `spawnSync` (never add `shell:true`), and keep `asAppleScriptString`/`balloonScript` escaping intact.

### [LOW] Stdin payload read is unbounded but parse-hardened and best-effort
- **OWASP**: A04 - Insecure Design | **CWE**: CWE-20
- **File**: `.claude/skills/harness/notify.mjs` (`readStdinPayload`)
- **Evidence**:
  ```js
  function readStdinPayload() {
    try { return JSON.parse(readFileSync(0, 'utf8')); } catch { return {}; }
  }
  ```
- **Impact**: Negligible. The Stop-hook payload is produced by Claude Code (trusted), only `stop_hook_active === true` is consumed, and any malformed/oversized/empty input degrades to `{}`. `emitStop` always returns 0, so a bad payload can never stall the Stop hook or crash the session. A pathologically large stdin would be read into memory, but the producer is the local harness, not a network peer.
- **Recommendation**: Accept as-is. If ever hardened, cap the read; not warranted for a trusted local producer.

## Dependencies
None added. `notify.mjs` imports only `node:` builtins (enforced by `test_when_notify_imports_only_node_builtins`); `package.json` runtime deps unchanged (asserted by `test_when_no_new_package_dependency`).

## Out of scope / Noted
- The delivery-reliability gap the user reported (macOS `osascript` returns exit 0 while silently dropping the banner) is a **usability** issue, not a security one — no finding. Mitigation (`terminal-notifier`) is out of this diff's scope by decision.
- `existsSync(join(rootDir, '.claude/state/.harness_active'))` uses a fixed relative path under a developer-controlled root; no path-traversal input. Clean.

