// T4 — the homepage must argue, not describe. The spine order is the assertion:
// problem before mechanism, and a single closing CTA band.
//
// RETIRED 2026-07-29, on the project owner's call, after the ad-hoc redesign:
//   - the differentiator-above-midpoint assertion. It pinned #swarm to the top
//     half; the redesign puts the phase walkthrough first and the subagent
//     section sixth, which is a deliberate ordering rather than drift.
//   - the problem-names-three-concrete-failures assertion. The hero states the
//     problem as a refused-tool-call transcript naming `push` and self-approval,
//     rather than as a prose list of four failure modes.
// Both were written for the previous homepage. What survives is the ordering
// that the redesign still holds itself to.

import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { ensureSiteBuilt, readRendered } from './helpers/site-build.mjs';

let html = '';

// Section order is read from the rendered document, not the template, so the
// assertion survives any Nunjucks restructuring that preserves output order.
function sectionOrder(doc) {
  return [...doc.matchAll(/<section\b[^>]*class="([^"]*)"[^>]*>/g)].map((m) => m[1]);
}

const indexOfClass = (order, needle) => order.findIndex((c) => c.includes(needle));

describe('T4 — homepage spine reads outcome-first', () => {
  before(() => {
    ensureSiteBuilt();
    html = readRendered('index.html');
  });

  it('test_when_homepage_rendered_then_problem_precedes_mechanism', () => { // AC-012
    const order = sectionOrder(html);
    const problem = indexOfClass(order, 'problem');
    const mechanism = indexOfClass(order, 'mechanism');
    assert.ok(problem >= 0, 'homepage must carry a problem section');
    assert.ok(mechanism >= 0, 'homepage must carry a mechanism section');
    assert.ok(
      problem < mechanism,
      `the problem must be stated before the mechanism; got problem@${problem}, mechanism@${mechanism}`,
    );
  });

  it('test_when_homepage_rendered_then_cta_band_is_last_section', () => { // AC-012
    const order = sectionOrder(html);
    const cta = indexOfClass(order, 'cta-band');
    assert.ok(cta >= 0, 'homepage must carry a closing CTA band');
    assert.equal(cta, order.length - 1, 'the CTA band must be the final section');
  });

});
