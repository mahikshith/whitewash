import test from 'node:test';
import assert from 'node:assert/strict';
import { proposeEdits, applyEdits, inspectWriting, inspectCharacters } from '../dist/engine.js';

test('plain punctuation is opt-in, respects quotes, code, ranges, locks and Unicode sequences', () => {
  const text = 'We’re ready… okay — next. 2019–2021. “Keep… — this” `code…` Locked… 👩‍👩‍👧‍👦 ❤️ 🏴\u{e0067}\u{e0062}\u{e0065}\u{e006e}\u{e0067}\u{e007f}';
  assert.equal(applyEdits(text, proposeEdits(text)), text);
  const output = applyEdits(text, proposeEdits(text, { punctuation: true, locks: ['Locked…'] }));
  // In plain text only the `code` span is protected; the prose around it is edited.
  assert.equal(output, text.replace('We’re ready… okay — next.', 'We\'re ready... okay - next.'));
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

test('stock AI phrasing is flagged, never edited, and respects quotes, code and word boundaries', () => {
  const text = 'Certainly! Let’s dive in. Overall, we delve into a rich tapestry. It\'s not just a tool, it\'s a partner. Not only fast but also cheap. **Bold** text. As of my last knowledge update, feel free to leverage it. Foster care stays. "We delve" quoted.\n`delve into tapestry`\nundelved delvers';
  const snapshot = text;
  const found = inspectWriting(text).map((note) => note.text);
  assert.deepEqual(found, ['Certainly!', 'Let’s dive in', 'Overall', 'delve', 'tapestry', 'It\'s not just a tool, it\'s', 'Not only fast but also', '**Bold**', 'As of my last knowledge update', 'feel free to', 'leverage']);
  assert.equal(text, snapshot);
  assert.ok(!inspectWriting('**Bold** in Markdown.', 'md').length);
  assert.ok(inspectWriting('Great question. I\'d be happy to help. In conclusion, it was pivotal.').every((note) => /leftover|opener|Hype/.test(note.note)));
});

test('new polish rules keep sentence-start capitals and leave protected text alone', () => {
  const text = 'Prior to launch, each and every team is able to ship. In spite of the fact that it rained, we met with regard to budgets. First and foremost, act in the near future. AT THE PRESENT TIME "prior to" stays.';
  assert.equal(applyEdits(text, proposeEdits(text, { mode: 'polish' })), 'Before launch, every team can ship. Although it rained, we met about budgets. First, act soon. NOW "prior to" stays.');
  assert.equal(applyEdits(text, proposeEdits(text, { mode: 'clean' })), text);
});

test('back-to-back openers still leave a capital at the start of the sentence', () => {
  const text = "In today's fast-paced world, it is important to note that teamwork is crucial. Certainly! It should be noted that we shipped.";
  assert.equal(applyEdits(text, proposeEdits(text, { mode: 'humanize' })), 'Teamwork is crucial. We shipped.');
  const mid = 'We met, and it is important to note that budgets slipped.';
  assert.equal(applyEdits(mid, proposeEdits(mid, { mode: 'humanize' })), 'We met, and budgets slipped.');
});

test('openers after list markers and headings, names, and chains of openers', () => {
  const h = (text) => applyEdits(text, proposeEdits(text, { mode: 'humanize' }));
  const cases = [
    ["- In today's fast-paced world, teams move fast.", '- Teams move fast.'],
    ["## In today's fast-paced world, headings work", '## Headings work'],
    ['1. Certainly! we ship.', '1. We ship.'],
    ['It is important to note that iPhone sales rose.', 'iPhone sales rose.'],
    ['It is important to note that eBay grew.', 'eBay grew.'],
    ["Overall, it's worth mentioning that results vary.", 'Results vary.'],
    ['Ultimately, at the end of the day, it is what it is.', 'It is what it is.'],
    ['Thanks. I hope this helps! Let me know if you have any questions.', 'Thanks.'],
    ['We shipped at the end of the day. Overall the team did well.', 'We shipped at the end of the day. Overall the team did well.'],
  ];
  for (const [input, expected] of cases) {
    assert.equal(h(input), expected, input);
    assert.equal(h(expected), expected, 'running Humanize twice changes nothing: ' + input);
  }
});
