---
key: dev-server-ownership
category: conventions
scope: [scenario, implement, tdd]
source: user-instruction
detection: before any spawn, run `lsof -ti:<PORT> -sTCP:LISTEN`. If something is listening, the user owns it: connect Playwright to the existing server, never kill the listener. If nothing is listening, Claude may spawn (capture PID at spawn) and owns the lifecycle until session-end.
applies-to: every skill or session needing a live preview — `impeccable live`, `verify` smoke, `integrate` browser tests, ad-hoc visual review during `/design-ui` or `/polish`, multi-pass `/impeccable` runs. Cross-reference with `landmines.md → lsof-port-kill-takes-firefox-with-it`.
surfaced-by: `process_lifecycle_guard` PreToolUse hook on Bash matching `kill|pkill|lsof|fuser|npm run.*serve|npm run.*dev|eleventy --serve|vite|next dev|astro dev|http.server`.
verified-at: 8201af6
last-touched: 2026-08-14
---

> verbatim (user, 2026-04-29, recorded in `_resume.md` snapshot):
> "if dev server is running (on 4321) do not start a new server and kill; only use playwright to open chrome; test and kill chrome; not the server; but if server is started by claude (in background shell) then kill it"

> verbatim (user, 2026-04-30, clarification after observed drift across multiple `/impeccable` passes that churned the dev server up/down):
> "if dev server is already running (say I manually started it), then do not kill the pid; else if dev server was started by claude (via bg shell) then it can choose to kill it after the work is finished."

- key clause: **"after the work is finished"** — ownership lifetime is **session-end** (or explicit user signal that the server is no longer needed), **not per-task or per-pass**. Iterative work across multiple Edits, Plays, and verifications shares one server. The 2026-04-30 clarification was issued after Claude killed and respawned the server three times across a single conversation; that pattern is the failure mode to avoid.
- cleanup pattern: kill **only the captured PID** (`kill "$(cat /tmp/devserver-<PORT>.pid)"`). Never `lsof -ti:PORT | xargs kill` — see `landmines.md → lsof-port-kill-takes-firefox-with-it`.
- session-end signals: end of conversation, explicit user message ("done with the server", "kill it now"), `/grant-commit` typed, or context window exit. Mid-conversation pauses, edits, Playwright runs, or test cycles are NOT session-end.
- **Pattern (single-spawn, session-lifetime):**
  ```bash
  PORT=4321
  PID_FILE="/tmp/devserver-$PORT.pid"
  if [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
    SERVER_OWNED_BY_CLAUDE=1                 # already spawned earlier this session
  elif lsof -ti:$PORT -sTCP:LISTEN >/dev/null 2>&1; then
    SERVER_OWNED_BY_CLAUDE=0                 # user owns it; don't touch
  else
    npx eleventy --serve --port=$PORT &      # spawn once, hold across passes
    echo $! > "$PID_FILE"
    SERVER_OWNED_BY_CLAUDE=1
  fi
  # … iterative work: edits, playwright open/close, verification, more edits …
  mcp__playwright__browser_close                # always close the browser between checks
  # … only at session-end (or on explicit user signal) …
  if [ "$SERVER_OWNED_BY_CLAUDE" = 1 ]; then
    kill "$(cat "$PID_FILE")" 2>/dev/null
    rm -f "$PID_FILE"
  fi
  ```
