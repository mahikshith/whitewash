// Used by scripts/check-office-roundtrips.py with generated, non-user fixtures.
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { DOMParser, XMLSerializer } from '@xmldom/xmldom';
import { processOffice } from '../dist/office.js';
globalThis.DOMParser = class {
  parseFromString(text, type) { return new DOMParser({ onError: (level, message) => { throw new Error(message); } }).parseFromString(text, type); }
};
globalThis.XMLSerializer = XMLSerializer;
const directory = process.argv[2];
if (!directory) throw new Error('Pass the synthetic fixture directory.');
for (const extension of ['docx', 'pptx', 'xlsx']) {
  const source = new Uint8Array(await readFile(join(directory, 'sample.' + extension)));
  for (const metadata of [false, true]) {
    const result = await processOffice(source, 'sample.' + extension, { metadata });
    if (!metadata && !result.report.edits.length) throw new Error('Expected prose edits in the fixture.');
    if (metadata && !result.report.properties.length) throw new Error('Expected properties in the fixture.');
    await writeFile(join(directory, (metadata ? 'metadata.' : 'edited.') + extension), result.bytes);
    console.log(JSON.stringify({ extension, metadata, edits: result.report.edits.length, properties: result.report.properties.length }));
  }
}
