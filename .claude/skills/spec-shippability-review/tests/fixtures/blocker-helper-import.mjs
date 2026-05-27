// Fixture for scan-shipped-skills-helper-files.test.mjs.
// A shipped .mjs helper that imports from the dev tree — the exact bug
// class that broke /triage in cybren-website (consumer install received
// seed-tasklist.mjs with `import { ... } from '../../../src/cli/...'`).
// The hardened scanner MUST flag this with a DEV_TREE_RUNTIME_REF BLOCKER.

import { validateWorkflowsJsonl } from '../../../src/cli/workflows-validator.js';
import { materializeTaskList } from '../../../src/cli/track-tasklist-materializer.js';

export function fixture() {
  return { validateWorkflowsJsonl, materializeTaskList };
}
