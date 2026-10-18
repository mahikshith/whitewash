import test from 'node:test';
import assert from 'node:assert/strict';
import { proposeEdits, applyEdits, inspectWriting, inspectCharacters } from '../dist/engine.js';

test('plain punctuation is opt-in, respects quotes, code, ranges, locks and Unicode sequences', () => {
  const text = 'We’re ready… okay — next. 2019–2021. “Keep… — this” `code…` Locked… 👩‍👩‍👧‍👦 ❤️ 🏴\u{e0067}\u{e0062}\u{e0065}\u{e006e}\u{e0067}\u{e007f}';
  assert.equal(applyEdits(text, proposeEdits(text)), text);
  const output = applyEdits(text, proposeEdits(text, { punctuation: true, locks: ['Locked…'] }));
  // A line containing inline code is conservatively retained in full.
  assert.equal(output, text);
  const prose = 'We’re ready… okay — next. 2019–2021. “Keep… — this” Locked…';
  assert.equal(applyEdits(prose, proposeEdits(prose, { punctuation: true, locks: ['Locked…'] })), 'We\'re ready... okay - next. 2019–2021. “Keep… — this” Locked…');
});

test('writing notes preserve text and exclude protected quotations, code, locks and substring matches', () => {
  const text = 'It is important to note that this is seamless. I hope this helps.\n\n“as an ai”\n\n`game-changing`\n\nseamlessly_code\n\ncutting-edge';
  const snapshot = text;
  const notes = inspectWriting(text, 'txt', ['cutting-edge']);
  assert.equal(notes.length, 3);
  assert.equal(notes[0].position, 1);
  assert.ok(notes.every((note) => text.slice(note.position - 1, note.position - 1 + note.text.length) === note.text));
  assert.equal(text, snapshot);
});

test('Unicode tags and variation selectors can be inspected without stripping valid flags or glyphs', () => {
  const text = '❤️ 🏴\u{e0067}\u{e0062}\u{e007f} 一\u{e0100}';
  const items = inspectCharacters(text);
  assert.ok(items.some((item) => item.code === 'U+FE0F'));
  assert.ok(items.some((item) => item.code === 'U+E0067'));
  assert.ok(items.some((item) => item.code === 'U+E0100'));
  assert.equal(applyEdits(text, proposeEdits(text, { mode: 'polish', zeroWidth: true, punctuation: true })), text);
});
