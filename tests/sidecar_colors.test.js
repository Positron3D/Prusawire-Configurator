// ABOUTME: Unit tests for the sidecar color lookups and category resolution.
// ABOUTME: Run with: node --test tests/sidecar_colors.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  cleanNodeName,
  stripNumericSuffix,
  globToRegExp,
  extendPath,
  buildSidecarLookups,
  lookupNode,
  categoryFor,
} from '../js/sidecar_colors.js';

const SIDECAR = {
  palette: {
    Main: { color: '#797979' },
    Hardware: { color: '#888888', metalness: 0.9, showInPicker: false },
    Hidden: { showInPicker: false, showInTree: false },
  },
  autoAssign: [
    { match: 'M3*', category: 'Hardware' },
    { match: 'SOLID*', category: 'Hidden' },
  ],
  nodes: {
    'Frame/Foot': { category: 'Main', displayName: 'Foot' },
    BareLeaf: { category: 'Hardware' },
  },
};

test('cleanNodeName mirrors the pipeline cleanup', () => {
  assert.equal(cleanNodeName('Some Part (mesh)'), 'Some_Part');
  assert.equal(cleanNodeName('a/b/Nut.step'), 'Nut');
  assert.equal(cleanNodeName('x[1].y:z'), 'x1yz');
});

test('stripNumericSuffix drops -N dedup tails', () => {
  assert.equal(stripNumericSuffix('Foo-2'), 'Foo');
  assert.equal(stripNumericSuffix('Foo'), 'Foo');
});

test('globToRegExp anchors and translates * and ?', () => {
  assert.equal(globToRegExp('M3*').test('M3x10_SHCS'), true);
  assert.equal(globToRegExp('M3*').test('DIN_M3'), false);
  assert.equal(globToRegExp('16?').test('16T'), true);
});

test('extendPath skips nameless components', () => {
  assert.equal(extendPath('', 'Frame'), 'Frame');
  assert.equal(extendPath('Frame', 'Foot'), 'Frame/Foot');
  assert.equal(extendPath('Frame', ''), 'Frame');
});

test('buildSidecarLookups applies palette defaults', () => {
  const l = buildSidecarLookups(SIDECAR);
  const main = l.palette.get('Main');
  assert.equal(main.metalness, 0.0);
  assert.equal(main.opacity, 1.0);
  assert.equal(main.showInPicker, true);
  assert.equal(l.palette.get('Hardware').showInPicker, false);
});

test('buildSidecarLookups splits path and leaf node keys', () => {
  const l = buildSidecarLookups(SIDECAR);
  assert.equal(l.nodesByPath.get('Frame/Foot').displayName, 'Foot');
  assert.equal(l.nodesByLeaf.get('BareLeaf').category, 'Hardware');
});

test('lookupNode: exact path, then bare-leaf, then -N stripped', () => {
  const l = buildSidecarLookups(SIDECAR);
  assert.equal(lookupNode(l, 'Frame/Foot').displayName, 'Foot');
  assert.equal(lookupNode(l, 'Any/Where/BareLeaf').category, 'Hardware');
  assert.equal(lookupNode(l, 'Any/BareLeaf-3').category, 'Hardware');
  assert.equal(lookupNode(l, 'Missing/Node'), null);
});

test('categoryFor: per-node entry beats autoAssign beats inherited', () => {
  const l = buildSidecarLookups(SIDECAR);
  assert.equal(categoryFor(l, 'Frame/Foot', 'M3_would_match', null), 'Main');
  assert.equal(categoryFor(l, 'No/Entry', 'M3x10_SHCS', 'Main'), 'Hardware');
  assert.equal(categoryFor(l, 'No/Entry', 'Unmatched_Name', 'Main'), 'Main');
  assert.equal(categoryFor(l, 'No/Entry', 'Unmatched_Name', null), null);
});
