/**
 * Pure-TypeScript BCn texture decoding (BC1, BC3, BC7) — the formats the
 * game's art ships in. No native code, no Python: this plus png.ts replaces
 * the Pillow dependency the extraction tools used to need, and runs the same
 * under the app's main process and the dev scripts.
 *
 * BC7 is bit-exact by specification, so correctness is provable: the
 * partition and anchor tables below were recovered mechanically from
 * Pillow's spec decoder with synthetic single-purpose blocks (never
 * hand-typed), and `node scripts/bc-check.ts` verifies this decoder
 * byte-for-byte against Pillow across every real texture family the app
 * extracts. BC1/BC3 interpolation uses floor division throughout, probed
 * against the same oracle (both BC1 color modes; BC3's color half is
 * 4-color regardless of endpoint order, per spec).
 */

/**
 * BC7 partition assignments and index anchors, recovered mechanically from
 * a spec decoder with synthetic blocks (see scripts/bc-check.ts, which
 * re-verifies them against real textures on every run). Partition rows are
 * bit-packed: 1 bit per texel for two subsets, 2 bits for three.
 */
const P2_BITS = [
  0xcccc, 0x8888, 0xeeee, 0xecc8, 0xc880, 0xfeec, 0xfec8, 0xec80,
  0xc800, 0xffec, 0xfe80, 0xe800, 0xffe8, 0xff00, 0xfff0, 0xf000,
  0xf710, 0x008e, 0x7100, 0x08ce, 0x008c, 0x7310, 0x3100, 0x8cce,
  0x088c, 0x3110, 0x6666, 0x366c, 0x17e8, 0x0ff0, 0x718e, 0x399c,
  0xaaaa, 0xf0f0, 0x5a5a, 0x33cc, 0x3c3c, 0x55aa, 0x9696, 0xa55a,
  0x73ce, 0x13c8, 0x324c, 0x3bdc, 0x6996, 0xc33c, 0x9966, 0x0660,
  0x0272, 0x04e4, 0x4e40, 0x2720, 0xc936, 0x936c, 0x39c6, 0x639c,
  0x9336, 0x9cc6, 0x817e, 0xe718, 0xccf0, 0x0fcc, 0x7744, 0xee22
];
const P3_BITS = [
  0xaa685050, 0x6a5a5040, 0x5a5a4200, 0x5450a0a8, 0xa5a50000, 0xa0a05050,
  0x5555a0a0, 0x5a5a5050, 0xaa550000, 0xaa555500, 0xaaaa5500, 0x90909090,
  0x94949494, 0xa4a4a4a4, 0xa9a59450, 0x2a0a4250, 0xa5945040, 0x0a425054,
  0xa5a5a500, 0x55a0a0a0, 0xa8a85454, 0x6a6a4040, 0xa4a45000, 0x1a1a0500,
  0x0050a4a4, 0xaaa59090, 0x14696914, 0x69691400, 0xa08585a0, 0xaa821414,
  0x50a4a450, 0x6a5a0200, 0xa9a58000, 0x5090a0a8, 0xa8a09050, 0x24242424,
  0x00aa5500, 0x24924924, 0x24499224, 0x50a50a50, 0x500aa550, 0xaaaa4444,
  0x66660000, 0xa5a0a5a0, 0x50a050a0, 0x69286928, 0x44aaaa44, 0x66666600,
  0xaa444444, 0x54a854a8, 0x95809580, 0x96969600, 0xa85454a8, 0x80959580,
  0xaa141414, 0x96960000, 0xaaaa1414, 0xa05050a0, 0xa0a5a5a0, 0x96000000,
  0x40804080, 0xa9a8a9a8, 0xaaaaaa44, 0x2a4a5254
];
const PARTITION2 = P2_BITS.map((bits) =>
  Array.from({ length: 16 }, (_, i) => (bits >> i) & 1)
);
const PARTITION3 = P3_BITS.map((bits) =>
  Array.from({ length: 16 }, (_, i) => (bits >>> (2 * i)) & 3)
);
const ANCHOR2 = [
  15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15,
  15, 2, 8, 2, 2, 8, 8, 15, 2, 8, 2, 2, 8, 8, 2, 2,
  15, 15, 6, 8, 2, 8, 15, 15, 2, 8, 2, 2, 2, 15, 15, 6,
  6, 2, 6, 8, 15, 15, 2, 2, 15, 15, 15, 15, 15, 2, 2, 15
];
const ANCHOR3B = [
  3, 3, 15, 15, 8, 3, 15, 15, 8, 8, 6, 6, 6, 5, 3, 3,
  3, 3, 8, 15, 3, 3, 6, 10, 5, 8, 8, 6, 8, 5, 15, 15,
  8, 15, 3, 5, 6, 10, 8, 15, 15, 3, 15, 5, 15, 15, 15, 15,
  3, 15, 5, 5, 5, 8, 5, 10, 5, 10, 8, 13, 15, 12, 3, 3
];
const ANCHOR3C = [
  15, 8, 8, 3, 15, 15, 3, 8, 15, 15, 15, 15, 15, 15, 15, 8,
  15, 8, 15, 3, 15, 8, 15, 8, 3, 15, 6, 10, 15, 15, 10, 8,
  15, 3, 15, 10, 10, 8, 9, 10, 6, 15, 8, 15, 3, 6, 6, 8,
  15, 3, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 3, 15, 15, 8
];

/** Interpolation weights, fixed by the BC7 spec per index width. */
const W2 = [0, 21, 43, 64];
const W3 = [0, 9, 18, 27, 37, 46, 55, 64];
const W4 = [0, 4, 9, 13, 17, 21, 26, 30, 34, 38, 43, 47, 51, 55, 60, 64];
const WEIGHTS: Record<number, number[]> = { 2: W2, 3: W3, 4: W4 };

const interp = (a: number, b: number, w: number): number => (a * (64 - w) + b * w + 32) >> 6;

/** Expand an n-bit endpoint channel to 8 bits by top-bit replication. */
const expand = (v: number, bits: number): number => {
  v <<= 8 - bits;
  return v | (v >> bits);
};

interface Mode {
  ns: number; // subsets
  pb: number; // partition bits
  rb: number; // rotation bits
  isb: number; // index-selector bits (mode 4)
  cb: number; // color endpoint bits per channel
  ab: number; // alpha endpoint bits (0 = opaque modes)
  epb: number; // unique p-bit per endpoint (1) or none (0)
  spb: number; // shared p-bit per subset (mode 1)
  ib: number; // primary index bits
  ib2: number; // secondary index bits (modes 4/5)
}

const MODES: Mode[] = [
  { ns: 3, pb: 4, rb: 0, isb: 0, cb: 4, ab: 0, epb: 1, spb: 0, ib: 3, ib2: 0 },
  { ns: 2, pb: 6, rb: 0, isb: 0, cb: 6, ab: 0, epb: 0, spb: 1, ib: 3, ib2: 0 },
  { ns: 3, pb: 6, rb: 0, isb: 0, cb: 5, ab: 0, epb: 0, spb: 0, ib: 2, ib2: 0 },
  { ns: 2, pb: 6, rb: 0, isb: 0, cb: 7, ab: 0, epb: 1, spb: 0, ib: 2, ib2: 0 },
  { ns: 1, pb: 0, rb: 2, isb: 1, cb: 5, ab: 6, epb: 0, spb: 0, ib: 2, ib2: 3 },
  { ns: 1, pb: 0, rb: 2, isb: 0, cb: 7, ab: 8, epb: 0, spb: 0, ib: 2, ib2: 2 },
  { ns: 1, pb: 0, rb: 0, isb: 0, cb: 7, ab: 7, epb: 1, spb: 0, ib: 4, ib2: 0 },
  { ns: 2, pb: 6, rb: 0, isb: 0, cb: 5, ab: 5, epb: 1, spb: 0, ib: 2, ib2: 0 }
];

class BitReader {
  private data: Buffer;
  private base: number;
  private pos = 0;

  constructor(data: Buffer, base: number) {
    this.data = data;
    this.base = base;
  }

  read(n: number): number {
    let v = 0;
    for (let i = 0; i < n; i++) {
      const bit = this.pos + i;
      v |= ((this.data[this.base + (bit >> 3)] >> (bit & 7)) & 1) << i;
    }
    this.pos += n;
    return v;
  }
}

/** The subset a texel belongs to, given subset count and partition id. */
function subsetOf(ns: number, partition: number, texel: number): number {
  if (ns === 1) return 0;
  return ns === 2 ? PARTITION2[partition][texel] : PARTITION3[partition][texel];
}

/** Whether a texel is an index anchor (its index stores one bit less). */
function isAnchor(ns: number, partition: number, texel: number): boolean {
  if (texel === 0) return true;
  if (ns === 2) return ANCHOR2[partition] === texel;
  if (ns === 3) return ANCHOR3B[partition] === texel || ANCHOR3C[partition] === texel;
  return false;
}

/** Decode one 4×4 BC7 block into out[64] as RGBA. */
function decodeBc7Block(data: Buffer, base: number, out: Uint8Array): void {
  let mode = 0;
  while (mode < 8 && ((data[base] >> mode) & 1) === 0) mode++;
  if (mode === 8) {
    out.fill(0); // reserved mode decodes to transparent black
    return;
  }
  const m = MODES[mode];
  const r = new BitReader(data, base);
  r.read(mode + 1);

  const partition = m.pb ? r.read(m.pb) : 0;
  const rotation = m.rb ? r.read(m.rb) : 0;
  const idxSel = m.isb ? r.read(m.isb) : 0;

  // Endpoints channel-major: all R, all G, all B, then A; subset-major within.
  const nEp = m.ns * 2;
  const ep: number[][] = Array.from({ length: nEp }, () => [0, 0, 0, 255]);
  for (let ch = 0; ch < 3; ch++) {
    for (let e = 0; e < nEp; e++) ep[e][ch] = r.read(m.cb);
  }
  if (m.ab) {
    for (let e = 0; e < nEp; e++) ep[e][3] = r.read(m.ab);
  }

  // P-bits extend every channel (alpha included on combined modes) by one bit.
  const cbits = m.cb + m.epb + m.spb;
  const abits = m.ab ? m.ab + m.epb : 0;
  if (m.epb) {
    for (let e = 0; e < nEp; e++) {
      const p = r.read(1);
      for (let ch = 0; ch < 4; ch++) {
        if (ch < 3 || m.ab) ep[e][ch] = (ep[e][ch] << 1) | p;
      }
    }
  } else if (m.spb) {
    for (let s = 0; s < m.ns; s++) {
      const p = r.read(1);
      for (const e of [ep[s * 2], ep[s * 2 + 1]]) {
        for (let ch = 0; ch < 3; ch++) e[ch] = (e[ch] << 1) | p;
      }
    }
  }
  for (let e = 0; e < nEp; e++) {
    for (let ch = 0; ch < 3; ch++) ep[e][ch] = expand(ep[e][ch], cbits);
    if (m.ab) ep[e][3] = abits === 8 ? ep[e][3] : expand(ep[e][3], abits);
  }

  // Index fields: primary set, then the secondary set on modes 4/5.
  const readIndices = (bits: number): number[] => {
    const idx = new Array<number>(16);
    for (let t = 0; t < 16; t++) {
      idx[t] = r.read(isAnchor(m.ns, partition, t) ? bits - 1 : bits);
    }
    return idx;
  };
  const primary = readIndices(m.ib);
  const secondary = m.ib2 ? readIndices(m.ib2) : null;

  // Mode 4's selector swaps which index set drives the vector vs the scalar.
  let colorIdx = primary;
  let colorBits = m.ib;
  let alphaIdx = secondary ?? primary;
  let alphaBits = m.ib2 || m.ib;
  if (idxSel === 1 && secondary) {
    colorIdx = secondary;
    colorBits = m.ib2;
    alphaIdx = primary;
    alphaBits = m.ib;
  }

  for (let t = 0; t < 16; t++) {
    const s = subsetOf(m.ns, partition, t);
    const e0 = ep[s * 2];
    const e1 = ep[s * 2 + 1];
    const cw = WEIGHTS[colorBits][colorIdx[t]];
    const o = t * 4;
    out[o] = interp(e0[0], e1[0], cw);
    out[o + 1] = interp(e0[1], e1[1], cw);
    out[o + 2] = interp(e0[2], e1[2], cw);
    if (m.ab) {
      out[o + 3] = interp(e0[3], e1[3], WEIGHTS[alphaBits][alphaIdx[t]]);
    } else {
      out[o + 3] = 255;
    }
    if (rotation) {
      const ch = rotation - 1; // 1=R, 2=G, 3=B swaps with A
      const a = out[o + 3];
      out[o + 3] = out[o + ch];
      out[o + ch] = a;
    }
  }
}

/** 565 color to [r8, g8, b8] by bit replication. */
function rgb565(v: number): [number, number, number] {
  return [expand((v >> 11) & 31, 5), expand((v >> 5) & 63, 6), expand(v & 31, 5)];
}

/** Decode one BC1 color block (8 bytes) — both color modes, floor math. */
function decodeBc1Block(
  data: Buffer,
  base: number,
  out: Uint8Array,
  alwaysFourColor: boolean
): void {
  const c0 = data.readUInt16LE(base);
  const c1 = data.readUInt16LE(base + 2);
  const [r0, g0, b0] = rgb565(c0);
  const [r1, g1, b1] = rgb565(c1);
  const pal: number[][] = [
    [r0, g0, b0, 255],
    [r1, g1, b1, 255]
  ];
  if (alwaysFourColor || c0 > c1) {
    pal.push(
      [((2 * r0 + r1) / 3) | 0, ((2 * g0 + g1) / 3) | 0, ((2 * b0 + b1) / 3) | 0, 255],
      [((r0 + 2 * r1) / 3) | 0, ((g0 + 2 * g1) / 3) | 0, ((b0 + 2 * b1) / 3) | 0, 255]
    );
  } else {
    pal.push([((r0 + r1) / 2) | 0, ((g0 + g1) / 2) | 0, ((b0 + b1) / 2) | 0, 255], [0, 0, 0, 0]);
  }
  const bits = data.readUInt32LE(base + 4);
  for (let t = 0; t < 16; t++) {
    const p = pal[(bits >> (t * 2)) & 3];
    out.set(p, t * 4);
  }
}

/** Overlay a BC4-style alpha block (8 bytes) onto out[t*4+3]. */
function decodeBc3Alpha(data: Buffer, base: number, out: Uint8Array): void {
  const a0 = data[base];
  const a1 = data[base + 1];
  const pal = new Array<number>(8);
  pal[0] = a0;
  pal[1] = a1;
  if (a0 > a1) {
    for (let i = 1; i < 7; i++) pal[i + 1] = (((7 - i) * a0 + i * a1) / 7) | 0;
  } else {
    for (let i = 1; i < 5; i++) pal[i + 1] = (((5 - i) * a0 + i * a1) / 5) | 0;
    pal[6] = 0;
    pal[7] = 255;
  }
  let bits = 0n;
  for (let i = 0; i < 6; i++) bits |= BigInt(data[base + 2 + i]) << BigInt(8 * i);
  for (let t = 0; t < 16; t++) {
    out[t * 4 + 3] = pal[Number((bits >> BigInt(t * 3)) & 7n)];
  }
}

type BlockDecoder = (data: Buffer, base: number, out: Uint8Array) => void;

/**
 * Reject bad input loudly instead of decoding garbage: a short buffer would
 * otherwise read out of bounds as undefined and propagate NaN into pixels
 * silently. Extra trailing bytes are tolerated (mip tails, padded payloads).
 * The message names the format, dimensions and byte counts so a logged error
 * code pins the failure without a debugger.
 */
function checkInput(
  format: string,
  data: Buffer,
  width: number,
  height: number,
  blockBytes: number
): void {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
    throw new Error(`${format}: invalid dimensions ${width}x${height}`);
  }
  const need = Math.ceil(width / 4) * Math.ceil(height / 4) * blockBytes;
  if (data.length < need) {
    throw new Error(
      `${format}: ${data.length} bytes for ${width}x${height} (need ${need})`
    );
  }
}

/** Walk a block-compressed image, cropping edge blocks on non-multiple sizes. */
function decodeBlocks(
  data: Buffer,
  width: number,
  height: number,
  blockBytes: number,
  decodeBlock: BlockDecoder
): Buffer {
  const out = Buffer.alloc(width * height * 4);
  const bw = Math.ceil(width / 4);
  const bh = Math.ceil(height / 4);
  const texels = new Uint8Array(64);
  for (let by = 0; by < bh; by++) {
    for (let bx = 0; bx < bw; bx++) {
      decodeBlock(data, (by * bw + bx) * blockBytes, texels);
      const maxY = Math.min(4, height - by * 4);
      const maxX = Math.min(4, width - bx * 4);
      for (let y = 0; y < maxY; y++) {
        const dst = ((by * 4 + y) * width + bx * 4) * 4;
        out.set(texels.subarray(y * 16, y * 16 + maxX * 4), dst);
      }
    }
  }
  return out;
}

/** BC7 (DXGI 98/99 — the sRGB variant carries identical bytes) → RGBA. */
export function decodeBC7(data: Buffer, width: number, height: number): Buffer {
  checkInput('BC7', data, width, height, 16);
  return decodeBlocks(data, width, height, 16, decodeBc7Block);
}

/** BC1 / DXT1 (DXGI 71) → RGBA, honoring the 3-color punch-through mode. */
export function decodeBC1(data: Buffer, width: number, height: number): Buffer {
  checkInput('BC1', data, width, height, 8);
  return decodeBlocks(data, width, height, 8, (d, b, o) => decodeBc1Block(d, b, o, false));
}

/** BC3 / DXT5 (DXGI 77) → RGBA; the color half is always 4-color per spec. */
export function decodeBC3(data: Buffer, width: number, height: number): Buffer {
  checkInput('BC3', data, width, height, 16);
  return decodeBlocks(data, width, height, 16, (d, b, o) => {
    decodeBc1Block(d, b + 8, o, true);
    decodeBc3Alpha(d, b, o);
  });
}
