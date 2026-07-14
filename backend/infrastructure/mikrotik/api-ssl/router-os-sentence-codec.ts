import { RouterOsTransportError } from './router-os-api-errors.js';

const textDecoder = new TextDecoder();
const textEncoder = new TextEncoder();

export function encodeSentence(words: readonly string[]): Uint8Array {
  const encodedWords = words.map((word) => {
    const body = textEncoder.encode(word);
    return [encodeLength(body.byteLength), body] as const;
  });
  const length = encodedWords.reduce(
    (total, [prefix, body]) => total + prefix.length + body.length,
    1,
  );
  const sentence = new Uint8Array(length);
  let offset = 0;
  for (const [prefix, body] of encodedWords) {
    sentence.set(prefix, offset);
    offset += prefix.length;
    sentence.set(body, offset);
    offset += body.length;
  }
  sentence[offset] = 0;
  return sentence;
}

export function decodeSentences(source: Uint8Array): {
  remainder: Uint8Array;
  sentences: readonly (readonly string[])[];
} {
  const sentences: string[][] = [];
  let words: string[] = [];
  let offset = 0;
  let sentenceStart = 0;
  while (offset < source.length) {
    const length = decodeLength(source, offset);
    if (length === null) break;
    if (length.value === 0) {
      sentences.push(words);
      words = [];
      offset += length.bytesRead;
      sentenceStart = offset;
      continue;
    }
    const wordStart = offset + length.bytesRead;
    const wordEnd = wordStart + length.value;
    if (wordEnd > source.length) break;
    words.push(textDecoder.decode(source.subarray(wordStart, wordEnd)));
    offset = wordEnd;
  }
  return { remainder: source.slice(sentenceStart), sentences };
}

function encodeLength(length: number): Uint8Array {
  if (!Number.isSafeInteger(length) || length < 0 || length >= 0x1_0000_0000) {
    throw new RangeError('Longitud de palabra RouterOS no permitida.');
  }
  if (length < 0x80) return Uint8Array.of(length);
  if (length < 0x4000) return Uint8Array.of((length >> 8) | 0x80, length & 0xff);
  if (length < 0x20_0000) {
    return Uint8Array.of((length >> 16) | 0xc0, (length >> 8) & 0xff, length & 0xff);
  }
  if (length < 0x1000_0000) {
    return Uint8Array.of(
      (length >> 24) | 0xe0,
      (length >> 16) & 0xff,
      (length >> 8) & 0xff,
      length & 0xff,
    );
  }
  return Uint8Array.of(
    0xf0,
    (length >>> 24) & 0xff,
    (length >>> 16) & 0xff,
    (length >>> 8) & 0xff,
    length & 0xff,
  );
}

function decodeLength(
  source: Uint8Array,
  offset: number,
): { bytesRead: number; value: number } | null {
  const first = source[offset];
  if (first === undefined) return null;
  if ((first & 0x80) === 0) return { bytesRead: 1, value: first };
  if ((first & 0xc0) === 0x80) {
    if (offset + 2 > source.length) return null;
    return { bytesRead: 2, value: ((first & 0x3f) << 8) | source[offset + 1]! };
  }
  if ((first & 0xe0) === 0xc0) {
    if (offset + 3 > source.length) return null;
    return {
      bytesRead: 3,
      value: ((first & 0x1f) << 16) | (source[offset + 1]! << 8) | source[offset + 2]!,
    };
  }
  if ((first & 0xf0) === 0xe0) {
    if (offset + 4 > source.length) return null;
    return {
      bytesRead: 4,
      value:
        ((first & 0x0f) << 24) |
        (source[offset + 1]! << 16) |
        (source[offset + 2]! << 8) |
        source[offset + 3]!,
    };
  }
  if (first === 0xf0) {
    if (offset + 5 > source.length) return null;
    return {
      bytesRead: 5,
      value:
        source[offset + 1]! * 0x1_000000 +
        (source[offset + 2]! << 16) +
        (source[offset + 3]! << 8) +
        source[offset + 4]!,
    };
  }
  throw new RouterOsTransportError('Prefijo de longitud RouterOS invalido.');
}
