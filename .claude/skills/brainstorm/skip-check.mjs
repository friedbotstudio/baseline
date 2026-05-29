// Foundation — brainstorm Stage 0 skip-check (AC-001, AC-001 concurrency).
// Two decision functions: the explicit workflow.json flag and the implicit
// "brief already on disk" short-circuit. Pure read; no writes.

import { existsSync } from 'node:fs';
import { join } from 'node:path';

export function shouldSkip(workflowJson) {
  return workflowJson?.skip_brainstorm === true;
}

export function shouldSkipForExistingBrief({ slug, rootDir }) {
  const briefPath = join(rootDir, 'docs/brief', `${slug}.md`);
  if (existsSync(briefPath)) {
    return { skip: true, reason: 'existing_brief', brief_path: briefPath };
  }
  return { skip: false };
}
