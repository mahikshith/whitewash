import { validateFile, MAX_CHARACTERS } from './engine.js';

export async function readTextFile(file) {
  const format = validateFile(file.name, file.size);
  let text;
  try {
    text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(await file.arrayBuffer());
  } catch (error) {
    if (error instanceof TypeError) throw new Error('Choose a valid UTF-8 text file.');
    throw error;
  }
  if (text.length > MAX_CHARACTERS) throw new Error('Keep the file under 100,000 characters.');
  if (text.includes('\0')) throw new Error('This file contains binary data. Choose a plain text file.');
  return { text, format, name: file.name };
}
