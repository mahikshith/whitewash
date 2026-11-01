import test from 'node:test';
import assert from 'node:assert/strict';
import { WHEEL, segmentAngles, hitTest, segmentPath, clampCentre } from '../dist/wheel-geometry.js';
import { fileKind, wheelActions } from '../dist/actions.js';
import { outputType, outputName, fitWithin, uniqueNames, formatBytes } from '../dist/images.js';

test('segment 0 sits at 12 o’clock and the rest go clockwise', () => {
  const [first, second] = segmentAngles(4);
  assert.ok(Math.abs(first.middle + Math.PI / 2) < 1e-9);
  assert.ok(Math.abs(second.middle) < 1e-9);
  const r = (WHEEL.inner + WHEEL.outer) / 2;
  assert.equal(hitTest(0, -r, 4), 0);
  assert.equal(hitTest(r, 0, 4), 1);
  assert.equal(hitTest(0, r, 4), 2);
  assert.equal(hitTest(-r, 0, 4), 3);
});

test('the hub, the ring and the outside are told apart', () => {
  assert.equal(hitTest(5, 5, 5), -1);
  assert.equal(hitTest(0, -(WHEEL.outer + WHEEL.reach - 1), 5), 0);
  assert.equal(hitTest(0, -(WHEEL.outer + WHEEL.reach + 1), 5), null);
});

test('segment paths are closed and stay inside the ring', () => {
  for (const count of [2, 4, 5]) for (const { start, end } of segmentAngles(count)) {
    const path = segmentPath(170, 170, start, end);
    assert.match(path, /^M .* Z$/);
    const numbers = path.match(/-?\d+(\.\d+)?/g).map(Number);
    assert.ok(numbers.every((n) => Number.isFinite(n)));
  }
});

test('the wheel is kept on screen', () => {
  const margin = WHEEL.outer + 16;
  assert.deepEqual(clampCentre(0, 0, 1280, 800), { x: margin, y: margin });
  assert.deepEqual(clampCentre(1280, 800, 1280, 800), { x: 1280 - margin, y: 800 - margin });
  assert.deepEqual(clampCentre(600, 400, 1280, 800), { x: 600, y: 400 });
});

test('file kinds come from the name first, then the MIME type seen during a drag', () => {
  assert.equal(fileKind({ name: 'notes.MD' }), 'text');
  assert.equal(fileKind({ name: 'deck.pptx' }), 'slides');
  assert.equal(fileKind({ type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }), 'word');
  assert.equal(fileKind({ type: 'image/webp' }), 'image');
  assert.equal(fileKind({ name: 'scan.pdf', type: 'application/pdf' }), 'pdf');
  assert.equal(fileKind({ name: 'data.csv' }), 'other');
  assert.equal(fileKind({ name: 'mystery.xyz' }), 'unknown');
});

test('the wheel only offers what fits the files', () => {
  const ids = (files) => wheelActions(files).actions.map((a) => a.id);
  assert.deepEqual(ids([{ name: 'a.txt' }]).slice(0, 3), ['polish', 'check', 'clean']);
  assert.ok(ids([{ name: 'a.xlsx' }]).includes('wipe'));
  const pngs = wheelActions([{ name: 'a.png', type: 'image/png' }, { name: 'b.png', type: 'image/png' }]).actions;
  assert.ok(!pngs.some((a) => a.convert === 'image/png'), 'no PNG to PNG');
  assert.ok(pngs.some((a) => a.convert === 'image/jpeg'));
  assert.ok(ids([{ name: 'a.pdf' }, { name: 'b.pdf' }]).includes('merge'));
  assert.ok(ids([{ name: 'a.pdf' }]).includes('to-docx'));
  assert.deepEqual(ids([{ name: 'a.docx' }, { name: 'b.jpg' }]), ['wipe']);
  assert.match(wheelActions([{ name: 'a.txt' }, { name: 'b.csv' }]).reason, /one type/);
  assert.match(wheelActions([{ name: 'a.xyz' }]).reason, /can’t open/);
  assert.match(wheelActions(Array.from({ length: 51 }, () => ({ name: 'x.jpg' }))).reason, /50/);
  for (const files of [[{ name: 'a.txt' }], [{ name: 'a.pdf' }], [{ name: 'a.jpg' }], [{ name: 'a.csv' }]]) assert.ok(wheelActions(files).actions.length <= 8);
});

test('image output names, types and sizes', () => {
  assert.equal(outputType('image/gif', 'keep'), 'image/png');
  assert.equal(outputType('image/jpeg', 'keep'), 'image/jpeg');
  assert.equal(outputType('image/png', 'image/webp'), 'image/webp');
  assert.equal(outputName('holiday.photo.HEIC', 'image/jpeg'), 'holiday.photo.jpg');
  assert.equal(outputName('me.jpg', 'image/jpeg', '-clean'), 'me-clean.jpg');
  assert.deepEqual(fitWithin(4000, 3000, 1600), { width: 1600, height: 1200 });
  assert.deepEqual(fitWithin(800, 600, 1600), { width: 800, height: 600 });
  assert.deepEqual(uniqueNames(['a.jpg', 'A.jpg', 'b.jpg', 'a.jpg']), ['a.jpg', 'A 2.jpg', 'b.jpg', 'a 3.jpg']);
  assert.equal(formatBytes(1_500_000), '1.5 MB');
});
