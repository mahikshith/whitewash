export const MAX_CHARACTERS = 100_000;
export const MAX_FILE_BYTES = 400_000;
export function quotationRanges(text) {
  return Array.from(text.matchAll(/"[^"]*(?:"|$)|“[^”]*(?:”|$)|‘[^’]*(?:’|$)|(?<!\p{L})'[^']*'(?!\p{L})/gu), (match) => [match.index, match.index + match[0].length]);
}

// Protect whole Markdown constructs conservatively; richer prose-node editing needs a parser.
export function protectedRanges(text, format = 'txt', locks = []) {
  const ranges = [];
  let offset = 0;
  let fence = null;
  let frontmatter = format === 'md' && /^---\r?\n/.test(text);
  for (const [index, line] of text.split(/(?<=\n)/).entries()) {
    const marker = line.match(/^\s*(?:>\s*)?(?:(?:[-*+] |\d+[.)] ))?(`{3,}|~{3,})/);
    if (fence) {
      ranges.push([offset, offset + line.length]);
      const closing = line.match(/^\s*(`{3,}|~{3,})\s*$/);
      if (closing && closing[1][0] === fence[0] && closing[1].length >= fence.length) fence = null;
    } else if (frontmatter) {
      ranges.push([offset, offset + line.length]);
      if (index > 0 && /^(---|\.\.\.)\s*$/.test(line)) frontmatter = false;
    } else if (marker) {
      fence = marker[1];
      ranges.push([offset, offset + line.length]);
    } else if (/^( {4}|\t)|`/.test(line) || (format === 'md' && /[|<>\[\]$]|!\[|^\s*(?:#{1,6}\s|>)/.test(line))) {
      ranges.push([offset, offset + line.length]);
    }
    offset += line.length;
  }
  const addMatches = (pattern) => {
    for (const match of text.matchAll(pattern)) ranges.push([match.index, match.index + match[0].length]);
  };
  addMatches(/https?:\/\/[^\s<>]+|www\.[^\s<>]+|[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/gu);
  ranges.push(...quotationRanges(text));
  addMatches(/\p{N}+(?:[.,:/%-]\p{N}+)*/gu);
  for (const term of locks.filter(Boolean)) {
    let start = text.indexOf(term);
    while (start !== -1) {
      ranges.push([start, start + term.length]);
      start = text.indexOf(term, start + term.length);
    }
  }
  return ranges;
}

const clarityRules = [
  [/(?<![\p{L}\p{N}_])in order to(?![\p{L}\p{N}_])/giu, 'to', 'Shorter purpose phrase'],
  [/(?<![\p{L}\p{N}_])due to the fact that(?![\p{L}\p{N}_])/giu, 'because', 'A direct explanation'],
  [/(?<![\p{L}\p{N}_])at this point in time(?![\p{L}\p{N}_])/giu, 'now', 'A simpler time reference'],
  [/(?<![\p{L}\p{N}_])a large number of(?![\p{L}\p{N}_])/giu, 'many', 'Less wordy phrasing'],
  [/(?<![\p{L}\p{N}_])in the event that(?![\p{L}\p{N}_])/giu, 'if', 'A simpler condition'],
  [/(?<![\p{L}\p{N}_])has the ability to(?![\p{L}\p{N}_])/giu, 'can', 'A direct verb'],
  [/(?<![\p{L}\p{N}_])on a daily basis(?![\p{L}\p{N}_])/giu, 'daily', 'Less wordy phrasing'],
  [/(?<![\p{L}\p{N}_])utilize(?![\p{L}\p{N}_])/giu, 'use', 'A familiar word'],
  [/(?<![\p{L}\p{N}_])utilizes(?![\p{L}\p{N}_])/giu, 'uses', 'A familiar word'],
  [/(?<![\p{L}\p{N}_])utilizing(?![\p{L}\p{N}_])/giu, 'using', 'A familiar word'],
];

export function proposeEdits(text, options = {}) {
  if (text.length > MAX_CHARACTERS) throw new Error('Keep this draft under 100,000 characters.');
  if ((options.locks || []).length > 50 || (options.locks || []).join('').length > 2000) throw new Error('Use up to 50 locked phrases, with 2,000 characters in total.');
  const protectedSpans = [];
  for (const range of [...protectedRanges(text, options.format, options.locks || []), ...(options.protectedSpans || [])].sort((a, b) => a[0] - b[0])) {
    const last = protectedSpans.at(-1);
    if (last && range[0] <= last[1]) last[1] = Math.max(last[1], range[1]);
    else protectedSpans.push([...range]);
  }
  const isProtected = (start, end) => {
    let low = 0;
    let high = protectedSpans.length;
    while (low < high) {
      const mid = (low + high) >>> 1;
      if (protectedSpans[mid][1] <= start) low = mid + 1;
      else high = mid;
    }
    return low < protectedSpans.length && protectedSpans[low][0] < end;
  };
  const edits = [];
  const add = (pattern, after, kind, reason) => {
    for (const match of text.matchAll(pattern)) {
      const start = match.index;
      const end = start + match[0].length;
      if (isProtected(start, end)) continue;
      if (edits.length >= 500) throw new Error('This draft has more than 500 suggestions. Review a smaller section; your original is unchanged.');
      let replacement = after;
      if (kind === 'clarity') {
        if (match[0] === match[0].toUpperCase()) replacement = after.toUpperCase();
        else if (/^[A-Z]/.test(match[0])) replacement = after[0].toUpperCase() + after.slice(1);
      }
      edits.push({ start, end, before: match[0], after: replacement, kind, reason });
    }
  };
  if (options.spaces !== false) add(/[\u00a0\u202f]/gu, ' ', 'cleanup', 'Replace a nonbreaking space with a regular space');
  if (options.softHyphens !== false) add(/\u00ad/gu, '', 'cleanup', 'Remove a discretionary soft hyphen');
  if (options.zeroWidth) add(/\u200b/gu, '', 'cleanup', 'Remove a zero-width space; review word boundaries');
  add(/^\ufeff/gu, '', 'cleanup', 'Remove the leading byte-order mark');
  if (options.punctuation) {
    add(/…/gu, '...', 'cleanup', 'Use three dots for an ellipsis');
    add(/ — /gu, ' - ', 'cleanup', 'Use a spaced hyphen instead of a spaced em dash');
    add(/(?<=\p{L})’(?=\p{L})/gu, "'", 'cleanup', 'Use a straight apostrophe');
  }
  if (options.mode === 'polish') for (const [pattern, after, reason] of clarityRules) add(pattern, after, 'clarity', reason);
  let previousEnd = 0;
  return edits.sort((a, b) => a.start - b.start).filter((edit) => {
    if (edit.start < previousEnd) return false;
    previousEnd = edit.end;
    return true;
  }).map((edit, id) => ({ ...edit, id }));
}

export function applyEdits(text, edits, selected = new Set(edits.map((edit) => edit.id))) {
  let cursor = 0;
  let result = '';
  for (const edit of edits) {
    if (edit.start < cursor || text.slice(edit.start, edit.end) !== edit.before) throw new Error('The draft changed. Review it again.');
    result += text.slice(cursor, edit.start) + (selected.has(edit.id) ? edit.after : edit.before);
    cursor = edit.end;
  }
  return result + text.slice(cursor);
}

const characters = new Map([
  ['\u00a0', ['Nonbreaking space', 'Keeps adjacent words together. Optional spacing change.']],
  ['\u202f', ['Narrow nonbreaking space', 'Often intentional in typography and French text.']],
  ['\u00ad', ['Soft hyphen', 'An optional line-break marker.']],
  ['\u200b', ['Zero-width space', 'Can mark word boundaries in some languages. Removal is off by default.']],
  ['\u200c', ['Zero-width non-joiner', 'Meaningful in several scripts. Always retained.']],
  ['\u200d', ['Zero-width joiner', 'Connects scripts and emoji. Always retained.']],
  ['\u2060', ['Word joiner', 'Controls line breaks. Retained.']],
  ['\ufeff', ['Byte-order mark / no-break character', 'Only a leading mark is eligible for removal.']],
  ['\u200e', ['Left-to-right mark', 'Directional text control. Retained.']],
  ['\u200f', ['Right-to-left mark', 'Directional text control. Retained.']],
  ...Array.from({ length: 5 }, (_, i) => [String.fromCodePoint(0x202a + i), ['Bidirectional control', 'Affects reading order. Retained for inspection.']]),
  ...Array.from({ length: 4 }, (_, i) => [String.fromCodePoint(0x2066 + i), ['Bidirectional isolate', 'Affects reading order. Retained for inspection.']]),
]);

export function inspectCharacters(text) {
  const found = new Map();
  let position = 0;
  for (const char of text) {
    const point = char.codePointAt(0);
    const special = characters.get(char) || (point >= 0xe0000 && point <= 0xe007f
      ? ['Unicode tag character', 'May be part of a flag emoji. Retained.']
      : ((point >= 0xfe00 && point <= 0xfe0f) || (point >= 0xe0100 && point <= 0xe01ef))
        ? ['Variation selector', 'Selects a glyph or emoji presentation. Retained.'] : null);
    if (special) {
      if (!found.has(char)) {
        const [name, note] = special;
        found.set(char, { name, note, code: `U+${char.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')}`, count: 0, positions: [] });
      }
      const item = found.get(char);
      item.count++;
      if (item.positions.length < 10) item.positions.push(position + 1);
    }
    position += char.length;
  }
  return [...found.values()];
}

export function wordCount(text) {
  // Space-delimited count; shown as an estimate for languages without word spaces.
  return text.trim() ? text.trim().split(/\s+/u).length : 0;
}

// Editorial prompts, not a classifier: common expressions cannot prove authorship.
export function inspectWriting(text, format = 'txt', locks = []) {
  if (text.length > MAX_CHARACTERS) throw new Error('Keep this draft under 100,000 characters.');
  if (locks.length > 50 || locks.join('').length > 2000) throw new Error('Use up to 50 locked phrases, with 2,000 characters in total.');
  const protectedSpans = protectedRanges(text, format, locks);
  const findings = [];
  const add = (pattern, note) => {
    for (const match of text.matchAll(pattern)) {
      if (protectedSpans.some(([start, end]) => match.index < end && match.index + match[0].length > start)) continue;
      if (findings.length >= 500) throw new Error('More than 500 writing notes. Check a smaller section.');
      findings.push({ text: match[0], position: match.index + 1, note });
    }
  };
  add(/(?<![\p{L}\p{N}_])(?:it is (?:important|worthwhile) to note that|it should be noted that|in today's fast-paced world|in the modern era)(?![\p{L}\p{N}_])/giu, 'Filler opener. Lead with the point instead.');
  add(/(?<![\p{L}\p{N}_])(?:as an ai(?: language model)?|i hope this helps|let me know if you (?:have|need)|here is the (?:revised|rewritten) (?:text|version))(?![\p{L}\p{N}_])/giu, 'Chatbot leftover. You probably want to cut it.');
  add(/(?<![\p{L}\p{N}_])(?:seamless(?:ly)?|game-changing|cutting-edge|unparalleled)(?![\p{L}\p{N}_])/giu, 'Hype word. A concrete detail would say more.');
  return findings.sort((a, b) => a.position - b.position);
}

export function validateFile(name, size) {
  if (!/\.(txt|md|markdown)$/i.test(name)) throw new Error('Choose a .txt or .md file. Word, slide and spreadsheet files have their own tools.');
  if (size > MAX_FILE_BYTES) throw new Error('Text files can be up to 400 KB.');
  return /\.(md|markdown)$/i.test(name) ? 'md' : 'txt';
}
