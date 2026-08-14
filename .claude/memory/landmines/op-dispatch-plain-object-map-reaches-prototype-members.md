---
key: op-dispatch-plain-object-map-reaches-prototype-members
category: landmines
scope: [security, tdd]
verified-at: 8201af6
last-touched: 2026-08-14
---

- Landmine: dispatching on a plain-object lookup map keyed by UNTRUSTED input — `const handler = OPS[frame.op]` — reaches INHERITED `Object.prototype` members. `OPS['__proto__']` returns `Object.prototype` (truthy but NOT callable → `TypeError` crash when called); `OPS['constructor']` / `OPS['toString']` return callable inherited members invoked as unintended handlers. On a socket/IPC/HTTP boundary, one crafted frame `{op:"__proto__"}` crashes the process (DoS).
- Mitigation: gate with `Object.hasOwn(OPS, op)` before lookup, OR build the map as `Object.create(null)` (no prototype chain). One line; no behavior change for valid keys.
- Found + fixed (1st): `.claude/mcp/sprint-broker/broker.mjs` `dispatch` + locking test `test_when_frame_op_is_prototype_key_then_error_ack_no_crash` (CWE-471). Applies to ANY untrusted-keyed object-map dispatch — routers, message handlers, plugin registries.
- RECURRENCE (2026-07-16, gate-taxonomy/C6): `.claude/hooks/lib/gate-taxonomy.mjs` `classifyOperation` had the identical defect — `OP_KIND_RULES[kind]` on a caller-supplied `kind` returned `{}` for `constructor`, a string for `toString`, and THREW for `hasOwnProperty`, bypassing the fail-safe `ask`. Fixed with `Object.hasOwn(OP_KIND_RULES, kind)` + regression test `test_when_prototype_key_kind_then_ask_no_throw`. Found by `/security` (CWE-1321), HIGH. **Two occurrences in one cycle → graduation candidate**: an advisory PreToolUse/lint check for untrusted-keyed object-map lookups without `Object.hasOwn`/`Object.create(null)` would catch the class structurally (see `retrospective`).
