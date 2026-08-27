/**
 * Generates build/icon.png (256×256) and build/icon.ico for the installer.
 * Pure Node — draws a collegiate pennant mark with supersampled geometry,
 * encodes the PNG by hand, and wraps it in a single-entry ICO.
 * Usage: node scripts/make-icon.ts
 */
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';

const SIZE = 256;
const SS = 4; // supersampling factor

// Palette
const BG_TOP = [13, 31, 60]; // deep collegiate navy
const BG_BOTTOM = [9, 20, 39];
const POLE = [233, 231, 226];
const PENNANT = [242, 169, 0]; // gold
const PENNANT_SHADE = [196, 132, 0];
const STRIPE = [244, 242, 238];

const inRoundRect = (x: number, y: number, size: number, r: number): boolean => {
  const min = 0;
  const max = size;
  if (x < min || x > max || y < min || y > max) return false;
  const cx = Math.max(min + r, Math.min(max - r, x));
  const cy = Math.max(min + r, Math.min(max - r, y));
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
};

const half = (ax: number, ay: number, bx: number, by: number, px: number, py: number) =>
  (bx - ax) * (py - ay) - (by - ay) * (px - ax);

const inTri = (
  p: [number, number],
  a: [number, number],
  b: [number, number],
  c: [number, number]
): boolean => {
  const d1 = half(a[0], a[1], b[0], b[1], p[0], p[1]);
  const d2 = half(b[0], b[1], c[0], c[1], p[0], p[1]);
  const d3 = half(c[0], c[1], a[0], a[1], p[0], p[1]);
  const neg = d1 < 0 || d2 < 0 || d3 < 0;
  const pos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(neg && pos);
};

// Geometry (in 256-space)
const POLE_X = 66;
const POLE_W = 9;
const POLE_TOP = 50;
const POLE_BOTTOM = 208;
const FLAG_TOP: [number, number] = [POLE_X + POLE_W - 1, 58];
const FLAG_BOTTOM: [number, number] = [POLE_X + POLE_W - 1, 138];
const FLAG_TIP: [number, number] = [206, 98];

// "RJ" monogram — varsity block glyphs on a 5×7 grid, painted inside the pennant
const GLYPHS: Record<string, string[]> = {
  R: ['XXXX.', 'X...X', 'X...X', 'XXXX.', 'X.X..', 'X..X.', 'X...X'],
  J: ['XXXXX', '...X.', '...X.', '...X.', '...X.', 'X..X.', '.XX..']
};
const MONOGRAM: { ch: string; x: number }[] = [
  { ch: 'R', x: 96 },
  { ch: 'J', x: 122 }
];
const LETTER_W = 21;
const LETTER_H = 30;
const LETTER_Y = 83;

function inMonogram(x: number, y: number): boolean {
  for (const { ch, x: lx } of MONOGRAM) {
    if (x < lx || x >= lx + LETTER_W || y < LETTER_Y || y >= LETTER_Y + LETTER_H) continue;
    const col = Math.floor(((x - lx) / LETTER_W) * 5);
    const row = Math.floor(((y - LETTER_Y) / LETTER_H) * 7);
    if (GLYPHS[ch][row]?.[col] === 'X') return true;
  }
  return false;
}

function shade(x: number, y: number): number[] | null {
  // pennant with a paper stripe near the hoist and a darker lower fold
  if (inTri([x, y], FLAG_TOP, FLAG_TIP, FLAG_BOTTOM)) {
    if (x < FLAG_TOP[0] + 16) return STRIPE;
    if (inMonogram(x, y)) return BG_TOP;
    // lower fold shading beneath the centerline toward the tip
    const t = (x - FLAG_TOP[0]) / (FLAG_TIP[0] - FLAG_TOP[0]);
    const midY = FLAG_TOP[1] + (FLAG_TIP[1] - FLAG_TOP[1]) * t;
    const lowY = FLAG_BOTTOM[1] + (FLAG_TIP[1] - FLAG_BOTTOM[1]) * t;
    return y > midY + (lowY - midY) * 0.55 ? PENNANT_SHADE : PENNANT;
  }
  if (x >= POLE_X && x <= POLE_X + POLE_W && y >= POLE_TOP && y <= POLE_BOTTOM) {
    return POLE;
  }
  // pole cap
  if ((x - (POLE_X + POLE_W / 2)) ** 2 + (y - POLE_TOP) ** 2 <= 7.5 ** 2) return PENNANT;
  if (inRoundRect(x, y, SIZE, 58)) {
    const t = y / SIZE;
    return [
      Math.round(BG_TOP[0] + (BG_BOTTOM[0] - BG_TOP[0]) * t),
      Math.round(BG_TOP[1] + (BG_BOTTOM[1] - BG_TOP[1]) * t),
      Math.round(BG_TOP[2] + (BG_BOTTOM[2] - BG_TOP[2]) * t)
    ];
  }
  return null;
}

// Render with supersampling
const pixels = Buffer.alloc(SIZE * SIZE * 4);
for (let y = 0; y < SIZE; y++) {
  for (let x = 0; x < SIZE; x++) {
    let r = 0;
    let g = 0;
    let b = 0;
    let a = 0;
    for (let sy = 0; sy < SS; sy++) {
      for (let sx = 0; sx < SS; sx++) {
        const px = x + (sx + 0.5) / SS;
        const py = y + (sy + 0.5) / SS;
        const c = shade(px, py);
        if (c) {
          r += c[0];
          g += c[1];
          b += c[2];
          a += 255;
        }
      }
    }
    const n = SS * SS;
    const i = (y * SIZE + x) * 4;
    const alpha = a / n;
    const cov = alpha / 255 || 1;
    pixels[i] = Math.round(r / n / cov);
    pixels[i + 1] = Math.round(g / n / cov);
    pixels[i + 2] = Math.round(b / n / cov);
    pixels[i + 3] = Math.round(alpha);
  }
}

// --- PNG encoding ---
const crcTable: number[] = [];
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  crcTable[n] = c >>> 0;
}
const crc32 = (buf: Buffer): number => {
  let c = 0xffffffff;
  for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type: string, data: Buffer): Buffer => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
};

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0);
ihdr.writeUInt32BE(SIZE, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 6; // RGBA
const raw = Buffer.alloc(SIZE * (SIZE * 4 + 1));
for (let y = 0; y < SIZE; y++) {
  raw[y * (SIZE * 4 + 1)] = 0; // filter: none
  pixels.copy(raw, y * (SIZE * 4 + 1) + 1, y * SIZE * 4, (y + 1) * SIZE * 4);
}
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0))
]);

// --- ICO wrapper (single 256px PNG entry) ---
const ico = Buffer.alloc(6 + 16);
ico.writeUInt16LE(0, 0); // reserved
ico.writeUInt16LE(1, 2); // type: icon
ico.writeUInt16LE(1, 4); // count
ico[6] = 0; // width 256 → 0
ico[7] = 0; // height 256 → 0
ico[8] = 0; // palette
ico[9] = 0; // reserved
ico.writeUInt16LE(1, 10); // planes
ico.writeUInt16LE(32, 12); // bpp
ico.writeUInt32LE(png.length, 14); // size
ico.writeUInt32LE(22, 18); // offset

mkdirSync('build', { recursive: true });
writeFileSync('build/icon.png', png);
writeFileSync('build/icon.ico', Buffer.concat([ico, png]));
console.log(`build/icon.png (${png.length} bytes) and build/icon.ico written`);
