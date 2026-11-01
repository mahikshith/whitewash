import test from 'node:test';
import assert from 'node:assert/strict';
import { tools, groups, toolFromHash, statusLabel, sections, sectionFromHash } from '../dist/tools.js';

test('root and Home show the directory; unknown tools never launch a processor', () => {
  for (const hash of ['', '#home', '#unknown', '#studio-other']) assert.equal(toolFromHash(hash), null);
});

test('every directory entry has a unique, directly addressable task page', () => {
  assert.equal(new Set(tools.map((tool) => tool.id)).size, tools.length);
  for (const tool of tools) assert.equal(toolFromHash('#' + tool.id), tool);
});

test('only implemented tools have a processing action and mode', () => {
  assert.equal(tools.filter((tool) => tool.state === 'ready').length, 35);
  for (const tool of tools) {
    assert.ok(groups.some((group) => group.id === tool.group), tool.id + ' belongs to a group');
    if (tool.state === 'ready') { assert.ok(tool.action); assert.ok(['clean', 'polish', 'humanize', 'inspect', 'writing', 'office', 'image', 'convert', 'pdf', 'wipe', 'archive', 'ocr'].includes(tool.mode)); }
    else { assert.equal(tool.action, undefined); assert.ok(['Soon', 'Research'].includes(statusLabel(tool))); }
  }
});

test('new tools are labelled and old Studio links retain their purpose', () => {
  assert.equal(statusLabel(tools.find((tool) => tool.id === 'convert')), 'New');
  assert.ok(tools.filter((tool) => tool.isNew).every((tool) => tool.state === 'ready'));
  assert.equal(toolFromHash('#studio?mode=clean').id, 'clean-text');
  assert.equal(toolFromHash('#studio?inspect=1').id, 'characters');
  assert.equal(toolFromHash('#studio').id, 'light-edit');
  assert.equal(toolFromHash('#image-clean').id, 'metadata');
  assert.equal(toolFromHash('#pdf'), null, 'PDF is a section page, not Merge');
  assert.equal(sectionFromHash('#pdf').id, 'pdf');
});

test('every section lists real tools, and Convert opens the converter', () => {
  for (const section of sections) for (const id of section.tools) assert.ok(tools.find((t) => t.id === id && t.state === 'ready'), section.id + ' → ' + id);
  assert.equal(sectionFromHash('#convert'), null);
  assert.ok(sections.find((s) => s.id === 'pdf').tools.includes('pdf-compress'));
});
