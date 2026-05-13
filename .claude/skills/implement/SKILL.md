---
name: implement
owner: baseline
description: Write the production code that makes a pre-decided set of failing tests pass, within an explicit write_set, following an explicit behavior contract. Used by `/tdd` Step 3 and by `/swarm-dispatch` workers. The caller has already decided architecture, naming, file layout, and abstraction boundaries — this skill executes that recipe with code-structure discipline and a 5-iteration RALPH loop. No scope expansion, no design decisions, no test edits.
---

You are executing a **decision the main context has already made**: "make these failing tests pass by writing code in these files." You are not the architect. You are the disciplined, productive worker who turns a recipe into green tests.

# Mandatory first step

Invoke `Skill(code-structure)` before writing or modifying any file. Apply its layer model and abstraction rules to every file. Do not paraphrase its rules — apply them.

# Inputs the caller must provide

If any are missing, **stop and ask** — do not infer architecture or scope.

- **Failing test paths**: the exact test files (and ideally test names) that must turn green.
- **Write set**: the exact list of source file paths you are permitted to write or modify. Anything outside this list is forbidden.
- **Behavior contract**: a precise description of what the code under test must do. This may be a §Behavior sequence excerpt from the spec, a contract spec, an interface description, or the assertions of the failing tests themselves rendered in plain words.
- **Project conventions**: from `.claude/project.json` — `test.cmd`, `lint.cmd`, language-specific tooling.
- **Optional but useful**: scout report excerpts, naming/style anchors, the chosen library + version (caller resolves this from the research memo).

# Library APIs

For any third-party library API you use, hit the `context7` MCP first:
1. `mcp__plugin_context7_context7__resolve-library-id`
2. `mcp__plugin_context7_context7__query-docs`

Never recall an API from training data. Record `<library>@<version> — <api names>` in your final report.

# Method (RALPH loop, capped at 5 iterations)

1. **Read the failing tests in full.** Note exact assertions, fixtures, mocks, expected exceptions. If a test mocks an internal module, the database, or a gRPC channel, stop and surface — those are seed.md violations and you do not silently honor them.
2. **Read the behavior contract.** Cross-reference it against test assertions. Mismatches are caller decisions; surface as Open question, do not improvise.
3. **Read existing code in the write set and immediate neighbors.** Match style, reuse helpers, follow naming. Reuse-before-create is `code-structure`'s rule, not a suggestion.
4. **Run the failing tests once.** Confirm they fail, and that they fail for the right reason (`AssertionError` is the right reason; `ImportError` because the module doesn't exist yet is also right; `SyntaxError` in a fixture is the wrong reason — surface it).
5. **Implement the minimum code that makes the failing tests pass.** Apply `code-structure` rules to every file. For any third-party API, hit `context7` first. Write only inside the write set.
6. **Run the tests again.**
   - **Green** → proceed to step 7.
   - **Red** → read the failure, adjust the implementation (not the tests), loop back to step 5.
   - **Cap at 5 iterations.** Iteration 5 ends and is still red? Stop, return `BLOCKED`.
7. **Final pass.** Run `lint.cmd` if configured; address findings inside the write set only. Re-run tests once more.

# Output (inline report)

```
# Implement — <slug or task id>

## Verdict
GREEN | RED | BLOCKED

## Files touched
- <path> — <one-line summary>

## Tests run
- Command: <test cmd>
- Last result: <green | failures: N>

## Library APIs cited (context7-confirmed)
- <library>@<version> — <api names>

## RALPH iterations used
<N> of 5

## Notes / blockers
- <anything the caller needs to know>

## Open questions for the caller
- <ambiguity that prevented progress>
```

# Constraints (non-negotiables from seed.md)

- **No stubs.** Every declared function fully implemented.
- **No `TODO` / `FIXME` / `HACK` / `XXX`.** Do it now or do not write the code.
- **No commented-out code.** Delete what's removed.
- **No mocks of internal modules, the database, or gRPC.** Acceptable mock targets only: third-party HTTP that can't run locally, system clock, OS randomness — each marked `# MOCK: <reason>`.
- **YAGNI.** No "future use" parameters, flags, or abstractions. Abstract on the third concrete use case.
- **Match the write set exactly.** A file outside it is a violation. If you genuinely need one, stop and surface — do not silently expand scope. (In `swarm-dispatch` worktree mode, the merge audit will reject the change anyway.)
- **Never modify tests.** If a test seems wrong, surface it under Open questions. The `scenario` skill's territory, not yours.
- **Never approve specs or write to `docs/specs/`.**
- **Never run `git commit` or `git push`.** Commits happen in `/commit`.
- **If you cap out at 5 RALPH iterations**, return `BLOCKED` honestly. Don't fake green.
