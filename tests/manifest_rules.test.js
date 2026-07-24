// ABOUTME: Unit tests for the manifest rules engine (defaults, clause
// ABOUTME: matching, part visibility). Run with: node --test tests/manifest_rules.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  defaultConfig,
  matchesClause,
  evaluateVisible,
  validConfigKeys,
  downloadFileList,
  availableChoices,
  reconcileConfig,
} from '../js/manifest_rules.js';

const OPTIONS = {
  pulley_size: {
    label: 'Pulley Size',
    type: 'radio',
    choices: [
      { id: '16t', label: '16T', default: true },
      { id: '20t', label: '20T', default: false },
    ],
  },
  mainboard: {
    label: 'Mainboard',
    type: 'radio',
    choices: [
      { id: 'rambo', label: 'Einsy Rambo', default: false },
      { id: 'skr', label: 'SKR Mini E3', default: false },
    ],
  },
  hexCowl: { label: 'Hex?', type: 'bool', default: true },
};

test('defaultConfig picks the flagged default choice', () => {
  assert.equal(defaultConfig(OPTIONS).pulley_size, '16t');
});

test('defaultConfig falls back to the first choice when none flagged', () => {
  assert.equal(defaultConfig(OPTIONS).mainboard, 'rambo');
});

test('defaultConfig uses bool defaults', () => {
  assert.equal(defaultConfig(OPTIONS).hexCowl, true);
});

test('matchesClause: single key equality', () => {
  assert.equal(matchesClause({ mainboard: 'skr' }, { mainboard: 'skr' }), true);
  assert.equal(matchesClause({ mainboard: 'skr' }, { mainboard: 'rambo' }), false);
});

test('matchesClause: AND across keys', () => {
  const clause = { rod_diameter: '8mm', frame_type: 'mk4' };
  assert.equal(matchesClause(clause, { rod_diameter: '8mm', frame_type: 'mk4' }), true);
  assert.equal(matchesClause(clause, { rod_diameter: '8mm', frame_type: 'mk3' }), false);
});

test('matchesClause: array value is OR within a key', () => {
  const clause = { hotend: ['revo', 'dragon'] };
  assert.equal(matchesClause(clause, { hotend: 'dragon' }), true);
  assert.equal(matchesClause(clause, { hotend: 'rapido' }), false);
});

test('matchesClause: missing config key never matches', () => {
  assert.equal(matchesClause({ mainboard: 'skr' }, {}), false);
});

test('evaluateVisible: no rules means visible', () => {
  assert.equal(evaluateVisible({ id: 'x', nodes: ['x'] }, {}), true);
});

test('evaluateVisible: hidden wins over everything', () => {
  const part = { id: 'x', nodes: ['x'], hidden: true, visible: { when: { a: 'b' } } };
  assert.equal(evaluateVisible(part, { a: 'b' }), false);
});

test('evaluateVisible: when must match', () => {
  const part = { id: 'x', nodes: ['x'], visible: { when: { pulley_size: '20t' } } };
  assert.equal(evaluateVisible(part, { pulley_size: '20t' }), true);
  assert.equal(evaluateVisible(part, { pulley_size: '16t' }), false);
});

test('evaluateVisible: unless must not match', () => {
  const part = { id: 'x', nodes: ['x'], visible: { unless: { psu: 'mk3_silver' } } };
  assert.equal(evaluateVisible(part, { psu: 'mk3_silver' }), false);
  assert.equal(evaluateVisible(part, { psu: 'delta_black' }), true);
});

test('evaluateVisible: when and unless combine', () => {
  const part = {
    id: 'x', nodes: ['x'],
    visible: { when: { a: '1' }, unless: { b: '2' } },
  };
  assert.equal(evaluateVisible(part, { a: '1', b: '3' }), true);
  assert.equal(evaluateVisible(part, { a: '1', b: '2' }), false);
  assert.equal(evaluateVisible(part, { a: '0', b: '3' }), false);
});

test('validConfigKeys lists the option ids', () => {
  assert.deepEqual(validConfigKeys(OPTIONS).sort(),
                   ['hexCowl', 'mainboard', 'pulley_size']);
});

const DOWNLOADS = {
  base: 'https://example.com/STLs/',
  always: ['Tools/a.stl'],
  groups: [
    { when: { pulley_size: '16t' }, files: ['Y/b16.stl'] },
    { when: { pulley_size: '20t' }, files: ['Y/b20.stl'] },
    { when: { psu: 'delta_black' }, files: ['Tools/a.stl', 'E/cover.stl'] },
  ],
};

test('downloadFileList includes always plus matching groups', () => {
  assert.deepEqual(
    downloadFileList(DOWNLOADS, { pulley_size: '16t', psu: 'mk3_silver' }),
    ['Tools/a.stl', 'Y/b16.stl']);
});

test('downloadFileList dedupes across always and groups', () => {
  assert.deepEqual(
    downloadFileList(DOWNLOADS, { pulley_size: '20t', psu: 'delta_black' }),
    ['Tools/a.stl', 'Y/b20.stl', 'E/cover.stl']);
});

test('downloadFileList handles missing sections', () => {
  assert.deepEqual(downloadFileList(undefined, {}), []);
  assert.deepEqual(downloadFileList({ base: 'x' }, {}), []);
});

const GATED = {
  z_rod: {
    choices: [
      { id: '10x325', default: true },
      { id: '8x320' },
    ],
  },
  bearing: {
    choices: [
      { id: 'lm10luu', default: true, when: { z_rod: ['10x325'] } },
      { id: 'lm8uu', when: { z_rod: ['8x320'] } },
      { id: 'lm8luu', when: { z_rod: ['8x320'] } },
    ],
  },
};

test('availableChoices filters by when clauses', () => {
  const ids = availableChoices(GATED.bearing, { z_rod: '8x320' }).map((c) => c.id);
  assert.deepEqual(ids, ['lm8uu', 'lm8luu']);
});

test('availableChoices keeps clause-less choices', () => {
  const ids = availableChoices(GATED.z_rod, {}).map((c) => c.id);
  assert.deepEqual(ids, ['10x325', '8x320']);
});

test('reconcileConfig resets an invalidated selection to first available', () => {
  const fixed = reconcileConfig(GATED, { z_rod: '8x320', bearing: 'lm10luu' });
  assert.equal(fixed.bearing, 'lm8uu');
});

test('reconcileConfig prefers the flagged default when it is available', () => {
  const fixed = reconcileConfig(GATED, { z_rod: '10x325', bearing: 'lm8uu' });
  assert.equal(fixed.bearing, 'lm10luu');
});

test('reconcileConfig leaves a valid config untouched', () => {
  const cfg = { z_rod: '8x320', bearing: 'lm8luu' };
  assert.deepEqual(reconcileConfig(GATED, cfg), cfg);
});
