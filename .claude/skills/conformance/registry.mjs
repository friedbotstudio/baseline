// Foundation — the one place that names which exported function reads which
// section of which artifact.
//
// Every registration holds a FUNCTION REFERENCE into the real reader, never a
// copy of its pattern. A table of patterns here would be a second declaration of
// every grammar it describes, kept in step with the real reader by nothing: the
// engine would go green while the reader drifted, which is the defect this check
// exists to close (spec Alternative C, rejected). Where a reader was previously
// inline and unexported, it was extracted and exported in its own module rather
// than reimplemented here.
//
// The adapters below only shape a reader's output into a comparable value. None
// of them decides what the reader matches.

import { sliceSection, sliceAcIds, sliceHeadingPresent, sliceIds } from '../lib/slice-grammar.mjs';
import { isAcIdShape } from '../lib/epic-acs.mjs';
import { hasClosureStamp } from '../../hooks/lib/closure-check.mjs';
import { parseFrontmatter } from '../../hooks/lib/frontmatter-parser.mjs';
import { sliceOwnershipInSpec, acIdsInSpec } from '../spec-lint/lint.mjs';
import { extractAcIds } from '../tdd/drift_check.mjs';
import { acceptanceCriteriaSection, behaviorHeadingIds } from '../spec-diagram-review/oracle.mjs';
import { acceptanceCriteriaLines } from '../spec-traceability-review/oracle.mjs';

function sliceGrammarAcs(doc) {
  return Object.fromEntries(sliceIds(doc).map((id) => [id, sliceAcIds(sliceSection(doc, id))]));
}

function specLintSliceAcs(doc) {
  return Object.fromEntries(sliceOwnershipInSpec(doc));
}

function epicStateAcsShape(doc) {
  const state = JSON.parse(doc);
  return Object.fromEntries((state.slices ?? []).map((s) => [String(s.id), isAcIdShape(s.acs)]));
}

function epicStateOwnership(doc) {
  const state = JSON.parse(doc);
  return Object.fromEntries((state.slices ?? []).map((s) => [String(s.id), (s.acs ?? []).map(String)]));
}

function frontmatterKeys(doc) {
  return Object.keys(parseFrontmatter(doc).frontmatter).sort();
}

/** Every reader the conformance check covers. */
export function registrations() {
  return [
    { id: 'slice-grammar:acs', artifact: 'spec', section: '## Slice <id>', module: '.claude/skills/lib/slice-grammar.mjs', read: sliceGrammarAcs },
    { id: 'spec-lint:slice-ownership', artifact: 'spec', section: '## Slice <id>', module: '.claude/skills/spec-lint/lint.mjs', read: specLintSliceAcs },
    { id: 'slice-grammar:presence', artifact: 'spec', section: '## Slice <id>', module: '.claude/skills/lib/slice-grammar.mjs', read: sliceHeadingPresent },
    { id: 'spec-lint:ac-section', artifact: 'spec', section: '## Acceptance criteria', module: '.claude/skills/spec-lint/lint.mjs', read: acIdsInSpec },
    { id: 'diagram-review:ac-section', artifact: 'spec', section: '## Acceptance criteria', module: '.claude/skills/spec-diagram-review/oracle.mjs', read: acceptanceCriteriaSection },
    { id: 'traceability:ac-section', artifact: 'spec', section: '## Acceptance criteria', module: '.claude/skills/spec-traceability-review/oracle.mjs', read: acceptanceCriteriaLines },
    { id: 'drift-check:ac-rows', artifact: 'spec', section: 'AC table row', module: '.claude/skills/tdd/drift_check.mjs', read: extractAcIds },
    { id: 'diagram-review:behavior-headings', artifact: 'spec', section: '### Behavior #N', module: '.claude/skills/spec-diagram-review/oracle.mjs', read: behaviorHeadingIds },
    { id: 'epic-acs:shape', artifact: 'epic-state', section: 'slices[].acs', module: '.claude/skills/lib/epic-acs.mjs', read: epicStateAcsShape },
    { id: 'spec-lint:state-ownership', artifact: 'epic-state', section: 'slices[].acs', module: '.claude/skills/spec-lint/lint.mjs', read: epicStateOwnership },
    { id: 'closure-check:stamp', artifact: 'memory-entry', section: 'frontmatter', module: '.claude/hooks/lib/closure-check.mjs', read: hasClosureStamp },
    { id: 'frontmatter-parser:keys', artifact: 'memory-entry', section: 'frontmatter', module: '.claude/hooks/lib/frontmatter-parser.mjs', read: frontmatterKeys },
  ];
}
