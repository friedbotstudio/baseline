# Security reports — notifier-attention-and-presence

## notifier-attention-and-presence-2026-07-10.md

# Security Review — notifier-attention-and-presence — 2026-07-10

## Summary
LOW risk. The change adds an attention-notification mode (`emitAttention`) and a macOS presence probe (`probePresence` via `ioreg`/`lsappinfo`) to `.claude/skills/harness/notify.mjs`. No new injection class: all four `spawnSync` sites use argv arrays with `timeout:5000` and **no `shell:true`**; both stdout parsers are linear regexes with no ReDoS; and the one piece of externally-influenced data (the frontmost app's bundle id) flows only into a string-equality comparison, never into a command, path, or notification body. No CRITICAL/HIGH/MEDIUM findings.

## Findings

### [LOW] Frontmost bundle-id influences only a suppression comparison
- **OWASP**: A04 - Insecure Design | **CWE**: CWE-807
- **File**: `.claude/skills/harness/notify.mjs` (`probePresence` → `presenceSuppresses`)
- **Evidence**:
  ```js
  const m = /"CFBundleIdentifier"\s*=\s*"([^"]+)"/.exec(String(info.stdout || ''));
  return m ? m[1] : null;   // frontmostBundleId
  // used only here:
  if (frontmostBundleId !== terminalBundleId) return false;   // string equality
  ```
- **Impact**: Negligible. The frontmost app's bundle id is whatever app the local user has focused. It reaches nothing but the `frontmostBundleId === terminalBundleId` comparison, whose only effect is whether a desktop notification is suppressed. A local process that could both focus itself and spoof the terminal's exact bundle id could at most suppress the user's own idle/attention pings — no code execution, no data access, and it already requires local control of the focused GUI app. Fail-open elsewhere (unknown → notify).
- **Recommendation**: No change. Documented as defense-in-depth.

### [LOW] Notifier-DSL escaping on the attention body (reused, already handled)
- **OWASP**: A03 - Injection | **CWE**: CWE-116
- **File**: `.claude/skills/harness/notify.mjs` (`composeAttentionNotification` → `deliver`)
- **Evidence**:
  ```js
  // body from payload.message or tool_input.questions[0].header
  // deliver(): spawnSync(cmd, rest, {timeout:5000, stdio:'ignore'})  // NO shell:true
  ```
- **Impact**: None reachable. Identical to the reviewed stop-body path: argv-array `spawnSync` bypasses the shell on every channel; the body reaches only the AppleScript literal (`asAppleScriptString` escapes `\`,`"`) or the PowerShell single-quoted string (`''` escaping). The payload is Claude-Code-produced (a `Notification` event `message`, or the model's own `AskUserQuestion` input), not remote-attacker input.
- **Recommendation**: No change. Keep the argv-array `spawnSync` and the existing escapers.

### [LOW] Stdin payload read is unbounded but parse-hardened (reused)
- **OWASP**: A04 - Insecure Design | **CWE**: CWE-20
- **File**: `.claude/skills/harness/notify.mjs` (`readStdinPayload`, consumed by `emitAttention`)
- **Impact**: Negligible. Same posture as stop-mode: `JSON.parse(readFileSync(0))` wrapped in `try/catch → {}`, only `message`/`tool_input`/`session_id` consumed, `emitAttention` always returns 0. Producer is local Claude Code, not a network peer.
- **Recommendation**: Accept as-is.

## Dependencies
None added. `notify.mjs` imports only `node:` builtins (enforced by `test_when_notify_imports_only_node_builtins`); `ioreg`/`lsappinfo` are macOS system binaries invoked by absolute-lookup argv, never installed. `package.json` runtime deps unchanged.

## Out of scope / Noted
- Presence probing runs three `spawnSync` calls (`ioreg` + two `lsappinfo`) per attention/stop event when `presence:aware` — each bounded by `timeout:5000`. A per-turn cost, not a security concern; macOS-only (non-darwin returns nulls immediately).
- `$TERM_PROGRAM` is trusted process env; if absent, `bundleIdFor` returns null → `presenceSuppresses` fails open (notifies). Correct fail-open posture.

