import test from 'node:test';
import assert from 'node:assert/strict';
import { tools, groups, toolFromHash, statusLabel } from '../dist/tools.js';
import { sections, sectionFromHash, sectionOf, sectionDial, leaves } from '../dist/sections.js';

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

test('no New badges, and old Studio links retain their purpose', () => {
  assert.ok(tools.every((tool) => !tool.isNew && statusLabel(tool) !== 'New'), 'no New badges');
  assert.equal(toolFromHash('#studio?mode=clean').id, 'clean-text');
  assert.equal(toolFromHash('#studio?inspect=1').id, 'characters');
  assert.equal(toolFromHash('#studio').id, 'light-edit');
  assert.equal(toolFromHash('#image-clean').id, 'metadata');
  assert.equal(toolFromHash('#pdf'), null, 'PDF is a section page, not Merge');
  assert.equal(sectionFromHash('#pdf').id, 'pdf');
});

test('format tabs: every link is a real tool or conversion, and pages light the right tab', () => {
  assert.deepEqual(sections.map((s) => s.id), ['humanize', 'pdf', 'word', 'excel', 'powerpoint', 'images', 'audio', 'archive']);
  for (const section of sections) for (const leaf of leaves(section)) {
    if (leaf.toolId) assert.ok(tools.find((t) => t.id === leaf.toolId && t.state === 'ready'), section.id + ' → ' + leaf.toolId);
    else assert.match(leaf.href, /^#convert\?from=\w+&to=\w+$/);
  }
  assert.equal(sectionFromHash('#convert'), null);
  assert.equal(sectionOf('#pdf-compress').id, 'pdf');
  assert.equal(sectionOf('#convert?from=docx&to=md').id, 'word');
  assert.equal(sectionDial(null).length, 8, 'homepage: one inner segment per tab');
  assert.ok(sectionDial(null).every((o) => o.children.length >= 2), 'each opens its jobs in the outer ring');
  for (const section of sections) {
    const dial = sectionDial(section.id);
    assert.ok(dial.length >= 3 && dial.length <= 9, section.id + ' has ' + dial.length + ' inner segments');
    for (const o of dial) for (const leaf of o.children || [o]) assert.ok(leaf.nav.startsWith('#'));
    for (const o of dial) assert.ok(!o.children || o.children.length <= 12);
  }
});
