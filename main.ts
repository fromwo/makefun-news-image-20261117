// news-image-20261117 — one image summing up Tuesday 17 November 2026.
//
// The picture lives next to this file as entry.png. This program makes
// sure it is a complete PNG inside the competition limits, then places an
// exact copy at <output>/entry.png. The output directory comes from
// MAKEFUN_OUTPUT_DIR, defaulting to /output inside the grader.
//
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const LIMIT_BYTES = 1048576;
const LIMIT_SIDE = 1024;
const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function die(reason) {
  console.error(`news-image-20261117: ${reason}`);
  process.exit(1);
}

function here() {
  return fileURLToPath(new URL('.', import.meta.url));
}

function loadImage() {
  const path = join(here(), 'entry.png');
  if (!existsSync(path)) die(`entry.png is missing next to main.ts (${path})`);
  const data = readFileSync(path);
  if (data.length > LIMIT_BYTES) {
    die(`entry.png is ${data.length} bytes, above the ${LIMIT_BYTES} byte limit`);
  }
  return data;
}

function checkSignature(data) {
  if (data.length < 8) die('entry.png is too short to be a PNG file');
  for (let i = 0; i < SIGNATURE.length; i += 1) {
    if (data[i] !== SIGNATURE[i]) die('entry.png does not begin with PNG magic bytes');
  }
}

function readDimensions(data) {
  if (data.length < 24) die('entry.png has no complete IHDR chunk');
  const width = data.readUInt32BE(16);
  const height = data.readUInt32BE(20);
  if (width < 1 || height < 1) die(`entry.png has an impossible size ${width}x${height}`);
  if (width > LIMIT_SIDE || height > LIMIT_SIDE) {
    die(`entry.png is ${width}x${height}, above the ${LIMIT_SIDE}x${LIMIT_SIDE} limit`);
  }
  return { width, height };
}

// CRC-32 (IEEE 802.3) table, built once at startup from the polynomial.
const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n += 1) {
  let value = n;
  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  crcTable[n] = value >>> 0;
}

function crc32(chunk) {
  let acc = 0xffffffff;
  for (let i = 0; i < chunk.length; i += 1) {
    acc = crcTable[(acc ^ chunk[i]) & 0xff] ^ (acc >>> 8);
  }
  return (acc ^ 0xffffffff) >>> 0;
}

function checkChunks(data) {
  // Every chunk must carry a matching CRC, and the file must end exactly
  // on its IEND chunk: anything truncated or padded is not a whole image.
  let cursor = 8;
  let closed = false;
  while (cursor + 8 <= data.length) {
    const size = data.readUInt32BE(cursor);
    const kind = data.toString('ascii', cursor + 4, cursor + 8);
    const bodyEnd = cursor + 8 + size;
    if (bodyEnd + 4 > data.length) die(`chunk ${kind} runs past the end of entry.png`);
    const expected = data.readUInt32BE(bodyEnd);
    const actual = crc32(data.subarray(cursor + 4, bodyEnd));
    if (expected !== actual) die(`chunk ${kind} fails its CRC check`);
    cursor = bodyEnd + 4;
    if (kind === 'IEND') {
      closed = true;
      break;
    }
  }
  if (!closed) die('entry.png has no IEND chunk');
  if (cursor !== data.length) die('entry.png has bytes after its IEND chunk');
}

const png = loadImage();
checkSignature(png);
const { width, height } = readDimensions(png);
checkChunks(png);

const targetDir = resolve(process.env.MAKEFUN_OUTPUT_DIR || '/output');
mkdirSync(targetDir, { recursive: true });
const target = join(targetDir, 'entry.png');
writeFileSync(target, png);
console.log(`news-image-20261117: wrote ${target} (${png.length} bytes, ${width}x${height} PNG)`);
