// Unit tests for site-src/_filters/rel-url.cjs — the pure function the eleventy
// `rel` filter wraps. The function converts a root-style site path
// (`/assets/x`) to a page-relative URL using the current page's URL to
// compute depth. See the source file for the full contract.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const { relUrl } = require(path.join(REPO_ROOT, 'site-src/_filters/rel-url.cjs'));

describe('relUrl — passthrough cases (input returned unchanged)', () => {
  it('test_when_input_is_empty_or_non_string_then_returned_as_is', () => {
    assert.equal(relUrl('', '/'), '');
    assert.equal(relUrl(undefined, '/'), undefined);
    assert.equal(relUrl(null, '/'), null);
    assert.equal(relUrl(42, '/'), 42);
  });

  it('test_when_input_is_fragment_then_returned_as_is', () => {
    assert.equal(relUrl('#section', '/cli/'), '#section');
    assert.equal(relUrl('#', '/'), '#');
  });

  it('test_when_input_is_protocol_relative_then_returned_as_is', () => {
    assert.equal(relUrl('//cdn.example.com/x.js', '/cli/'), '//cdn.example.com/x.js');
  });

  it('test_when_input_is_absolute_url_then_returned_as_is', () => {
    assert.equal(relUrl('https://github.com/foo', '/cli/'), 'https://github.com/foo');
    assert.equal(relUrl('http://example.org', '/'), 'http://example.org');
    assert.equal(relUrl('mailto:foo@bar.com', '/'), 'mailto:foo@bar.com');
    assert.equal(relUrl('data:image/svg+xml,...', '/'), 'data:image/svg+xml,...');
    assert.equal(relUrl('javascript:void(0)', '/'), 'javascript:void(0)');
  });

  it('test_when_input_is_already_relative_then_returned_as_is', () => {
    assert.equal(relUrl('assets/site.css', '/cli/'), 'assets/site.css');
    assert.equal(relUrl('./assets/site.css', '/cli/'), './assets/site.css');
    assert.equal(relUrl('../assets/site.css', '/cli/'), '../assets/site.css');
  });
});

describe('relUrl — depth-aware rewriting', () => {
  it('test_when_root_style_path_at_depth_0_then_prefixed_with_dot_slash', () => {
    assert.equal(relUrl('/assets/site.css', '/'), './assets/site.css');
    assert.equal(relUrl('/hooks/', '/'), './hooks/');
  });

  it('test_when_root_style_path_at_depth_1_then_prefixed_with_dot_dot_slash', () => {
    assert.equal(relUrl('/assets/site.css', '/cli/'), '../assets/site.css');
    assert.equal(relUrl('/hooks/', '/cli/'), '../hooks/');
  });

  it('test_when_root_style_path_at_depth_2_then_prefixed_with_dot_dot_slash_twice', () => {
    assert.equal(relUrl('/assets/site.css', '/skills/core/'), '../../assets/site.css');
    assert.equal(relUrl('/hooks/', '/skills/core/'), '../../hooks/');
  });

  it('test_when_input_is_bare_root_then_returns_directory_relative', () => {
    assert.equal(relUrl('/', '/'), './');
    assert.equal(relUrl('/', '/cli/'), '../');
    assert.equal(relUrl('/', '/skills/core/'), '../../');
  });

  it('test_when_input_has_inline_fragment_then_full_path_rewritten', () => {
    assert.equal(relUrl('/swarm/#dispatch', '/cli/'), '../swarm/#dispatch');
    assert.equal(relUrl('/cli/#plantuml', '/install/'), '../cli/#plantuml');
  });

  it('test_when_pageUrl_is_falsy_then_treated_as_root', () => {
    assert.equal(relUrl('/x', undefined), './x');
    assert.equal(relUrl('/x', ''), './x');
    assert.equal(relUrl('/x', null), './x');
  });
});
