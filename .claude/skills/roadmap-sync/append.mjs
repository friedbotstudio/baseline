// roadmap-append — pure text->text transforms that add an epic section to the plan.
// Domain: appendEpic, the additive-only merge. The heading grammar and the CWE-74
// guard live in lib/epic-heading.mjs; this is the only writer that creates rows,
// so it is the site that guard protects.

import {
  matchEpicHeadingLine,
  assertInert,
  PLANNED,
  IN_PROGRESS,
  DONE,
} from '../lib/epic-heading.mjs';

const TAG = /\(([^)]*)\)\s*$/;
const SLICE_ID = /^[A-Za-z0-9][A-Za-z0-9-]*$/;

// --- Foundation: read the epic headings already on the plan ------------------

function epicHeadings(text) {
  const headings = [];
  for (const line of String(text ?? '').split('\n')) {
    const m = matchEpicHeadingLine(line);
    if (m) headings.push({ num: m.num, tag: TAG.exec(m.rest)?.[1]?.trim() ?? null });
  }
  return headings;
}

export function nextEpicNumber(text) {
  const nums = epicHeadings(text).map((h) => h.num);
  return nums.length === 0 ? 1 : Math.max(...nums) + 1;
}

export function epicPresent(text, slug) {
  return epicHeadings(text).some((h) => h.tag === slug);
}

// --- Foundation: the heading emoji a body of rows implies --------------------

function impliedHeadingStatus(slices) {
  const statuses = slices.map((s) => s.status ?? PLANNED);
  if (statuses.length === 0 || statuses.every((s) => s === PLANNED)) return PLANNED;
  if (statuses.every((s) => s === DONE)) return DONE;
  return IN_PROGRESS;
}

// --- Foundation: the summary is a whole line, so it needs a stricter guard ----

// `title` and `tag` are interpolated INTO the middle of the heading line, so a
// `## ` they carry can never land at a line start. `summary` is pushed as a line
// of its own, which makes it the one field that can forge a heading outright:
// `## Epic 99 — Injected (pwned)` carries no newline and no status emoji, so
// assertInert passes it, and every reader that scans lines then sees a real
// epic. The row grammars all require a status emoji, so assertInert already
// covers those; the heading is the only residual and this closes it.
function assertSummaryInert(summary) {
  if (summary === undefined || summary === null || summary === '') return;
  assertInert(summary, 'epic summary');
  if (matchEpicHeadingLine(summary)) {
    throw new Error('roadmap-append: epic summary must not be an epic heading');
  }
}

// --- Domain: render one epic section -----------------------------------------

export function renderEpicSection({ num, title, tag, summary, slices = [] }) {
  assertInert(title, 'epic title');
  assertInert(tag, 'epic tag');
  assertSummaryInert(summary);
  for (const slice of slices) {
    if (!SLICE_ID.test(String(slice.id ?? ''))) {
      throw new Error(`roadmap-append: slice id ${JSON.stringify(slice.id)} must match ${SLICE_ID}`);
    }
    assertInert(slice.title, `slice ${slice.id} title`);
  }

  const lines = [`## Epic ${num} — ${title}  ${impliedHeadingStatus(slices)}  (${tag})`, ''];
  if (summary) lines.push(summary, '');
  for (const slice of slices) lines.push(`- ${slice.status ?? PLANNED} ${slice.id}. ${slice.title}`);
  lines.push('');
  return lines.join('\n');
}

// --- Domain: additive-only merge, deduped on the slug tag --------------------

export function appendEpic(text, { slug, title, summary, slices = [] }) {
  const body = String(text ?? '');
  if (epicPresent(body, slug)) return { text: body, changed: false, epicNum: null };

  const epicNum = nextEpicNumber(body);
  const section = renderEpicSection({ num: epicNum, title, tag: slug, summary, slices });
  const separator = body.endsWith('\n') ? '' : '\n';
  return { text: `${body}${separator}${section}`, changed: true, epicNum };
}
