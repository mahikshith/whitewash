export const MAX_CHARACTERS = 100_000;
export const MAX_FILE_BYTES = 400_000;
export function quotationRanges(text) {
  return Array.from(text.matchAll(/"[^"]*(?:"|$)|“[^”]*(?:”|$)|‘[^’]*(?:’|$)|(?<!\p{L})'[^']*'(?!\p{L})/gu), (match) => [match.index, match.index + match[0].length]);
}

// Protect whole Markdown constructs conservatively; richer prose-node editing needs a parser.
// `artifacts` keeps only code, frontmatter, quotations and locks: copy-paste residue may sit in Markdown lines, URLs or next to digits.
export function protectedRanges(text, format = 'txt', locks = [], { artifacts = false } = {}) {
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
    } else if (/^( {4}|\t)|`/.test(line) || (!artifacts && format === 'md' && /[|<>\[\]$]|!\[|^\s*(?:#{1,6}\s|>)/.test(line))) {
      ranges.push([offset, offset + line.length]);
    }
    offset += line.length;
  }
  const addMatches = (pattern) => {
    for (const match of text.matchAll(pattern)) ranges.push([match.index, match.index + match[0].length]);
  };
  if (!artifacts) addMatches(/https?:\/\/[^\s<>]+|www\.[^\s<>]+|[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/gu);
  ranges.push(...quotationRanges(text));
  if (!artifacts) addMatches(/\p{N}+(?:[.,:/%-]\p{N}+)*/gu);
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
  [/(?<![\p{L}\p{N}_])(?:in spite of|despite) the fact that(?![\p{L}\p{N}_])/giu, 'although', 'A direct contrast'],
  [/(?<![\p{L}\p{N}_])with regards? to(?![\p{L}\p{N}_])/giu, 'about', 'A shorter preposition'],
  [/(?<![\p{L}\p{N}_])prior to(?![\p{L}\p{N}_])/giu, 'before', 'A familiar word'],
  [/(?<![\p{L}\p{N}_])in the near future(?![\p{L}\p{N}_])/giu, 'soon', 'A simpler time reference'],
  [/(?<![\p{L}\p{N}_])at the present time(?![\p{L}\p{N}_])/giu, 'now', 'A simpler time reference'],
  [/(?<![\p{L}\p{N}_])until such time as(?![\p{L}\p{N}_])/giu, 'until', 'A simpler time reference'],
  [/(?<![\p{L}\p{N}_])(?:is|are) able to(?![\p{L}\p{N}_])/giu, 'can', 'A direct verb'],
  [/(?<![\p{L}\p{N}_])each and every(?![\p{L}\p{N}_])/giu, 'every', 'Less wordy phrasing'],
  [/(?<![\p{L}\p{N}_])first and foremost(?![\p{L}\p{N}_])/giu, 'first', 'Less wordy phrasing'],
];

// Stock AI wording with a plain swap that keeps the sentence intact.
const wSource = (body, tail = '') => `(?<![\\p{L}\\p{N}_])(?:${body})(?![\\p{L}\\p{N}_])${tail}`;
const w = (body, tail) => new RegExp(wSource(body, tail), 'giu');
const tellRules = [
  [w('delve into'), 'look at', 'Plainer than “delve into”'], [w('delves into'), 'looks at', 'Plainer than “delves into”'],
  [w('delved into'), 'looked at', 'Plainer than “delved into”'], [w('delving into'), 'looking at', 'Plainer than “delving into”'],
  [w('a (?:myriad|plethora) of'), 'many', 'Plainer than a stock AI phrase'],
  [w('leverage'), 'use', 'Plainer than “leverage”'], [w('leverages'), 'uses', 'Plainer than “leverages”'],
  [w('leveraged'), 'used', 'Plainer than “leveraged”'], [w('leveraging'), 'using', 'Plainer than “leveraging”'],
  [w('seamless'), 'smooth', 'Less hype'], [w('seamlessly'), 'smoothly', 'Less hype'],
  [w('in the realm of'), 'in', 'Plainer than “in the realm of”'],
  [w('navigat(?:e|ing) the (?:complexities|intricacies) of'), 'handle', 'Plainer than a stock AI phrase'],
  [w('harness(?:ing)? the power of'), 'use', 'Plainer than a stock AI phrase'],
  [w('unlock(?:ing)? the (?:full )?potential of'), 'get the most from', 'Plainer than a stock AI phrase'],
  [w('cutting-edge|state-of-the-art'), 'modern', 'Less hype'],
  [w('game-changing|groundbreaking|revolutionary'), 'new', 'Less hype'],
  [w('ever-evolving'), 'changing', 'Less hype'],
  [w('pivotal'), 'key', 'Less hype'],
];
// Openers and sign-offs that add nothing. Removed whole.
const cutRules = [
  [w('(?:it is|it[’\']s) (?:important|worth|worthwhile) (?:to note|noting) that', String.raw`,?\s*`), 'Cut a filler opener'],
  [w('it should be noted that', String.raw`,?\s*`), 'Cut a filler opener'],
  [w('in today[’\']s fast-paced world|in the modern era|in today[’\']s digital age', String.raw`,?\s*`), 'Cut a filler opener'],
  [/(?<=^|[.!?]\s+|\n)(?:in conclusion|in summary|to sum up|overall|ultimately|in essence),\s*/gimu, 'Cut a filler opener'],
  [/(?<=^|[.!?]\s+|\n)(?:certainly|absolutely|of course|sure|great question)!\s*/gimu, 'Cut a chatbot leftover'],
  [w('as an ai(?: language model)?', String.raw`,?\s*`), 'Cut a chatbot leftover'],
  [/(?<=^|[.!?]\s+|\n)(?:i hope this helps|let me know if you (?:have|need) (?:any(?:thing)?|more)[^.!?\n]{0,60}|i hope this email finds you well|feel free to (?:reach out|ask|let me know)[^.!?\n]{0,60})[.!]?[ \t]*/gimu, 'Cut a chatbot sign-off'],
  [w('(?:please )?feel free to', String.raw`\s+`), 'Cut “feel free to”'],
];

// Chatbot copy-paste residue: citation plumbing that only renders inside the chat UI.
const artifactRules = [
  [/\uE200(?:file)?cite(?:\uE202[\w-]+)+\uE201/gu, 'Remove a ChatGPT source-pill marker; its link did not survive the copy'],
  [/[\uE200-\uE203]*(?:(?:file)?cite(?=turn\d)|(?<![\p{L}\p{N}_]))(?:\uE202?turn\d+[a-z]{1,32}\d+(?:L\d+(?:-L\d+)?)?)+[\uE200-\uE203]*/gu, 'Remove a ChatGPT search citation ID'],
  [/【(?:\d+(?::\d+)?†[^【】\n]{1,80}|(?:file)?cite(?:\|[\w-]+)+|oai_citation(?:_attribution)?:\d+‡[^【】\n]{0,200})】/gu, 'Remove a ChatGPT citation marker'],
  [/(?<=\[)oai_citation(?:_attribution)?:\d+‡(?=[^\]\n]+\]\()/gu, 'Remove a ChatGPT citation label; the link stays'],
  [/:{0,2}contentReference\[oaicite:\d+\](?:\{index=\d+\})?|\[oaicite:\d+\](?:\{index=\d+\})?|\(oaicite:\d+\)\{index=\d+\}/gu, 'Remove a ChatGPT content-reference marker'],
];
const trackingParam = String.raw`(?:utm_source=(?:chatgpt\.com|chatgpt|openai|copilot\.com|copilot|perplexity(?:\.ai)?)|utm_medium=chatgpt|referrer=grok\.com)(?=[&#]|[).,;:!?'"\]]*$)`;
const trackingRun = new RegExp(`([?&])${trackingParam}(?:&${trackingParam})*`, 'giu');

export function proposeEdits(text, options = {}) {
  if (text.length > MAX_CHARACTERS) throw new Error('Keep this draft under 100,000 characters.');
  if ((options.locks || []).length > 50 || (options.locks || []).join('').length > 2000) throw new Error('Use up to 50 locked phrases, with 2,000 characters in total.');
  const guard = (ranges) => {
    const spans = [];
    for (const range of [...ranges, ...(options.protectedSpans || [])].sort((a, b) => a[0] - b[0])) {
      const last = spans.at(-1);
      if (last && range[0] <= last[1]) last[1] = Math.max(last[1], range[1]);
      else spans.push([...range]);
    }
    return (start, end) => {
      let low = 0;
      let high = spans.length;
      while (low < high) {
        const mid = (low + high) >>> 1;
        if (spans[mid][1] <= start) low = mid + 1;
        else high = mid;
      }
      return low < spans.length && spans[low][0] < end;
    };
  };
  const isProtected = guard(protectedRanges(text, options.format, options.locks || []));
  const edits = [];
  const push = (start, end, after, kind, reason) => {
    if (edits.length >= 500) throw new Error('This draft has more than 500 suggestions. Review a smaller section; your original is unchanged.');
    edits.push({ start, end, before: text.slice(start, end), after, kind, reason });
  };
  const add = (pattern, after, kind, reason) => {
    for (const match of text.matchAll(pattern)) {
      const start = match.index;
      const end = start + match[0].length;
      if (isProtected(start, end)) continue;
      let replacement = after;
      if (kind === 'clarity') {
        if (match[0] === match[0].toUpperCase()) replacement = after.toUpperCase();
        else if (/^[A-Z]/.test(match[0])) replacement = after[0].toUpperCase() + after.slice(1);
      }
      push(start, end, replacement, kind, reason);
    }
  };
  if (options.artifacts !== false) {
    const isLocked = guard(protectedRanges(text, options.format, options.locks || [], { artifacts: true }));
    const found = [];
    for (const [pattern, reason] of artifactRules) for (const match of text.matchAll(pattern)) {
      const end = match.index + match[0].length;
      if (match[0] && !isLocked(match.index, end)) found.push([match.index, end, reason]);
    }
    // Overlapping finds keep the earliest; touching markers become one edit so spacing is tidied once.
    const runs = [];
    for (const item of found.sort((a, b) => a[0] - b[0] || b[1] - a[1])) {
      const last = runs.at(-1);
      if (last && item[0] < last[1]) continue;
      if (last && /^[ \t]*$/.test(text.slice(last[1], item[0]))) [last[1], last[2]] = [item[1], last[2] === item[2] ? item[2] : 'Remove chatbot citation markers'];
      else runs.push([...item]);
    }
    for (const [start, end, reason] of runs) {
      const lead = /[ \t\u00a0\u202f]*$/.exec(text.slice(Math.max(0, start - 50), start))[0].length;
      const trail = /^[ \t\u00a0\u202f]*/.exec(text.slice(end, end + 50))[0].length;
      let span = [start, end];
      if (start - lead === 0 || text[start - lead - 1] === '\n') span = [start, end + trail];
      else if (lead && (trail || end === text.length || /[\r\n.,;:!?)\]}。，、；：！？]/u.test(text[end]))) span = [start - lead, end];
      push(...(isLocked(...span) ? [start, end] : span), '', 'artifact', reason);
    }
    for (const url of text.matchAll(/https?:\/\/[^\s<>]+|www\.[^\s<>]+/giu)) for (const match of url[0].matchAll(trackingRun)) {
      let start = url.index + match.index;
      let end = start + match[0].length;
      if (match[1] === '?' && url[0][match.index + match[0].length] === '&') [start, end] = [start + 1, end + 1];
      if (!isLocked(start, end)) push(start, end, '', 'artifact', 'Remove a chatbot tracking tag from the link');
    }
  }
  if (options.spaces !== false) add(/[\u00a0\u202f]/gu, ' ', 'cleanup', 'Replace a nonbreaking space with a regular space');
  if (options.softHyphens !== false) add(/\u00ad/gu, '', 'cleanup', 'Remove a discretionary soft hyphen');
  if (options.zeroWidth) add(/\u200b/gu, '', 'cleanup', 'Remove a zero-width space; review word boundaries');
  add(/^\ufeff/gu, '', 'cleanup', 'Remove the leading byte-order mark');
  if (options.punctuation) {
    add(/…/gu, '...', 'cleanup', 'Use three dots for an ellipsis');
    add(/ — /gu, ' - ', 'cleanup', 'Use a spaced hyphen instead of a spaced em dash');
    add(/(?<=\p{L})’(?=\p{L})/gu, "'", 'cleanup', 'Use a straight apostrophe');
  }
  if (options.mode === 'polish' || options.mode === 'humanize') for (const [pattern, after, reason] of clarityRules) add(pattern, after, 'clarity', reason);
  if (options.mode === 'humanize') {
    for (const [pattern, after, reason] of tellRules) add(pattern, after, 'clarity', reason);
    // Openers and chatbot sign-offs: cut them and capitalise what follows.
    for (const [pattern, reason] of cutRules) for (const match of text.matchAll(pattern)) {
      let start = match.index; const end = start + match[0].length;
      if (isProtected(start, end)) continue;
      const next = text[end] || '';
      const atStart = start === 0 || /[.!?]\s*$|\n\s*$/.test(text.slice(Math.max(0, start - 3), start));
      // A cut that ends the line takes the space before it too.
      if (end === text.length || next === '\n') while (start > 0 && /[ \t]/.test(text[start - 1])) start--;
      push(start, end, '', 'clarity', reason);
      // Capitalise the next word as its own edit, so it keeps its own formatting.
      if (atStart && /\p{Ll}/u.test(next)) push(end, end + 1, next.toUpperCase(), 'clarity', 'Capitalise the new first word');
    }
    if (options.format !== 'md') for (const match of text.matchAll(/\*\*([^*\n]{1,200})\*\*/gu)) if (!isProtected(match.index, match.index + match[0].length)) push(match.index, match.index + match[0].length, match[1], 'cleanup', 'Remove leftover Markdown bold');
  }
  let previousEnd = 0;
  return edits.sort((a, b) => a.start - b.start || b.end - a.end).filter((edit) => {
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
  const words = (body) => new RegExp(`(?<![\\p{L}\\p{N}_])(?:${body})(?![\\p{L}\\p{N}_])`, 'giu');
  add(words("in conclusion|in summary|to sum up|let[’']s (?:dive|delve) in(?:to)?|here[’']s (?:a|the) (?:breakdown|quick overview|rundown)|when it comes to"), 'Filler opener. Lead with the point instead.');
  add(/(?<=^[ \t]*|[.!?][ \t]+)(?:overall|ultimately|in essence)(?=,)/gimu, 'Filler opener. Lead with the point instead.');
  add(words("(?:certainly|absolutely|of course|sure)!|great question|i[’']d be happy to help|i[’']d be glad to help|as of my last (?:knowledge )?(?:update|training(?: data| cutoff)?)|(?:please )?feel free to|i hope this email finds you well"), 'Chatbot leftover. You probably want to cut it.');
  add(words("ever-evolving|groundbreaking|revolutionary|transformative|pivotal|unprecedented|world-class|state-of-the-art"), 'Hype word. A concrete detail would say more.');
  add(words("delv(?:e|es|ed|ing)|tapestry|(?:a |is a |stands as a )?testament to|navigat(?:e|es|ing) the (?:complexities|landscape|intricacies)|in the realm of|a myriad of|a plethora of|plethora|leverag(?:e|es|ed|ing)|harness(?:es|ing)? the power|unlock(?:s|ing)? the (?:full )?potential|embark(?:s|ing)? on (?:a|this|your) journey|foster(?:s|ing)?(?! (?:care|parents?|homes?|child(?:ren)?|famil(?:y|ies)))|elevat(?:e|es|ing)|robust (?:solutions?|frameworks?|platforms?|ecosystems?|approach(?:es)?|strateg(?:y|ies))"), 'Stock AI phrasing. Plainer words would sound like you.');
  add(words("(?:it|this|that)(?:[’']s not| is not| isn[’']t) (?:just|only|merely|simply) [^.!?\\n]{1,60}?[,;:—–] ?(?:it[’']s|it is|but)|not only [^.!?\\n]{1,80}? but also"), 'Contrast formula. Say what it is directly.');
  if (format !== 'md') add(/\*\*[^*\n]{1,200}\*\*/gu, 'Leftover Markdown bold. Plain text will show the asterisks.');
  return findings.sort((a, b) => a.position - b.position);
}

export function validateFile(name, size) {
  if (!/\.(txt|md|markdown)$/i.test(name)) throw new Error('Choose a .txt or .md file. Word, slide and spreadsheet files have their own tools.');
  if (size > MAX_FILE_BYTES) throw new Error('Text files can be up to 400 KB.');
  return /\.(md|markdown)$/i.test(name) ? 'md' : 'txt';
}
