---
key: "@debugmcp/mcp-debugger@0.23.0"
category: libraries
scope: [research, spec, tdd, integrate]
governs: .mcp.json,.claude/skills/codebugger/**
verified-at: 8fb72a5
last-touched: 2026-08-15
---

- Role: step-through debugging MCP server. Exposes real language debuggers as tools over the Debug Adapter Protocol, so a hypothesis about runtime state can be answered by a value read from a paused process rather than by inference. The oracle behind the `codebugger` skill's explanation trace.
- Registry facts, read 2026-08-15 from `registry.npmjs.org/@debugmcp/mcp-debugger/latest`: `license: MIT`, `engines: {"node":">=22.0.0"}`, `bin: {"mcp-debugger":"dist/cli"}`, **`dependencies: {}`** — zero runtime deps, matching the baseline's own stance.
- API (parameter names as documented): `create_debug_session(language, name)`, `set_breakpoint(sessionId, file, line)`, `start_debugging(sessionId, scriptPath)`, `get_stack_trace(sessionId)`, `get_scopes(sessionId, frameId)`, `get_variables(sessionId, scope)`, `evaluate_expression(sessionId, ...)`, `get_output(sessionId)`, `list_supported_languages()`, `close_debug_session(sessionId)`.
- Invocation: `{"command":"npx","args":["-y","@debugmcp/mcp-debugger","stdio"]}`. The `stdio` positional is **required** — the project's README states it exists "to prevent console corruption of JSON-RPC protocol". Omitting it corrupts the JSON-RPC stream rather than failing loudly.
- Caveat — the redaction claim is unverified. The README asserts secrets are "masked before reaching the agent". The only redaction reachable in its documentation is `docs/logging-format-specification.md`, which describes the **log** path: values truncated to 200 chars, at most 10 variables per entry, environment values replaced with a count summary, sensitive keys scrubbed by pattern. That is not a documented guarantee about the tool result returned to the agent. This is why [[an-observed-value-is-recorded-as-a-bounded-typed-rendering]] exists.
- Caveat: not in any lockfile. Like `context7`, it is fetched by `npx` at launch from `.mcp.json`, so the version above is the registry's `latest` at the verify date rather than a pinned dependency. Re-read the registry before citing the version.
- Caveat: needs Node 22+ **plus** a per-language debug toolchain (debugpy, rdbg, js-debug, Delve, JDK 21+, .NET SDK, a Rust or C/C++ toolchain). Probe `list_supported_languages` before assuming an adapter is available.
