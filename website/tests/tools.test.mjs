import test from 'node:test';
import assert from 'node:assert/strict';
import { tools, toolFromHash, statusLabel } from '../dist/tools.js';

test('root and Home show the directory; unknown tools never launch a processor', () => {
  for (const hash of ['', '#home', '#unknown', '#studio-other']) assert.equal(toolFromHash(hash), null);
});

test('every directory entry has a unique, directly addressable task page', () => {
  assert.equal(new Set(tools.map((tool) => tool.id)).size, tools.length);
  for (const tool of tools) assert.equal(toolFromHash('#' + tool.id), tool);
});

test('only implemented tools have a processing action and mode', () => {
  assert.equal(tools.filter((tool) => tool.state === 'ready').length, 9);
  for (const tool of tools) {
    if (tool.state === 'ready') { assert.ok(tool.action); assert.ok(['clean', 'polish', 'inspect', 'writing', 'office'].includes(tool.mode)); }
    else { assert.equal(tool.action, undefined); assert.ok(['Soon', 'Research'].includes(statusLabel(tool))); }
  }
});

test('new shipped tools are first and old Studio links retain their purpose', () => {
  assert.equal(tools[0].isNew, true);
  assert.equal(statusLabel(tools[0]), 'New');
  assert.equal(toolFromHash('#studio?mode=clean').id, 'clean-text');
  assert.equal(toolFromHash('#studio?inspect=1').id, 'characters');
  assert.equal(toolFromHash('#studio').id, 'light-edit');
});
