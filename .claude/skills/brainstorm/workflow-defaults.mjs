// Foundation — workflow.json field defaults for backward compatibility with
// pre-brainstorm in-flight workflows (AC-008). Pure object merge; no I/O.

export function withDefaults(workflowJson) {
  return {
    ...workflowJson,
    skip_brainstorm: workflowJson?.skip_brainstorm ?? false,
    codesign_mode: workflowJson?.codesign_mode ?? false,
  };
}
