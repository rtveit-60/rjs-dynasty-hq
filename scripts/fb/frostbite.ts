/**
 * Minimal Frostbite container reader for the CFB 27 PC install (dev-side tooling only).
 *
 * Scope: read-only enumeration + extraction of assets from the game's Data/ folder —
 * layout.toc (legacy DbObject), Manifest2019-style superbundle .toc files (huffman-named
 * bundle lists with inline binary bundles), and CAS block data decompressed through the
 * game's own oo2core_9_win64.dll (Oodle) via koffi.
 *
 * Format notes are logged in docs/RESEARCH.md ("Game asset containers").
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { GAME_ROOT_FALLBACK, locateGameRoot, settingsGameDir } from '../../src/main/game-locate.ts';

// ---------------------------------------------------------------------------
// TOC payload (0x22C signature header, plain payload on this Frostbite branch)
// ---------------------------------------------------------------------------

const TOC_HEADER_SIZE = 0x22c;

export function readTocPayload(filePath: string): Buffer {
  const raw = fs.readFileSync(filePath);
  if (raw.length >= 4 && raw[0] === 0x00 && raw[1] === 0xd1 && raw[2] === 0xce) {
    return raw.subarray(TOC_HEADER_SIZE);
  }
  return raw;
}

// ---------------------------------------------------------------------------
// Legacy DbObject (layout.toc)
// ---------------------------------------------------------------------------

export type DbValue =
  | null
  | boolean
  | number
  | bigint
  | string
  | Buffer
  | DbValue[]
  | { [key: string]: DbValue };

const DbType = {
  Terminator: 0,
  List: 1,
  Dict: 2,
  Boolean: 6,
  String: 7,
  Int: 8,
  Long: 9,
  Float: 11,
  Double: 12,
  Guid: 15,
  Sha1: 16,
  Blob: 19,
} as const;

class Cursor {
  buf: Buffer;
  pos: number;
  constructor(buf: Buffer, pos = 0) {
    this.buf = buf;
    this.pos = pos;
  }
  u8() {
    return this.buf[this.pos++];
  }
  leb128(): number {
    let result = 0;
    let shift = 0;
    for (;;) {
      const b = this.buf[this.pos++];
      result |= (b & 0x7f) << shift;
      if ((b & 0x80) === 0) return result >>> 0;
      shift += 7;
    }
  }
  cstring(): string {
    const end = this.buf.indexOf(0, this.pos);
    const s = this.buf.toString('utf8', this.pos, end);
    this.pos = end + 1;
    return s;
  }
}

function readDbEntry(c: Cursor, type: number): DbValue {
  switch (type) {
    case DbType.List: {
      const size = c.leb128();
      const end = c.pos + size;
      const list: DbValue[] = [];
      while (c.pos < end) {
        const t = c.u8();
        if ((t & 0x1f) === DbType.Terminator) break;
        list.push(readDbEntry(c, t & 0x1f));
      }
      c.pos = end;
      return list;
    }
    case DbType.Dict: {
      const size = c.leb128();
      const end = c.pos + size;
      const dict: { [key: string]: DbValue } = {};
      while (c.pos < end) {
        const t = c.u8();
        if ((t & 0x1f) === DbType.Terminator) break;
        const name = c.cstring();
        dict[name] = readDbEntry(c, t & 0x1f);
      }
      c.pos = end;
      return dict;
    }
    case DbType.Boolean:
      return c.u8() !== 0;
    case DbType.String: {
      const len = c.leb128();
      const s = c.buf.toString('utf8', c.pos, c.pos + len - 1);
      c.pos += len;
      return s;
    }
    case DbType.Int: {
      const v = c.buf.readInt32LE(c.pos);
      c.pos += 4;
      return v;
    }
    case DbType.Long: {
      const v = c.buf.readBigInt64LE(c.pos);
      c.pos += 8;
      return v;
    }
    case DbType.Float: {
      const v = c.buf.readFloatLE(c.pos);
      c.pos += 4;
      return v;
    }
    case DbType.Double: {
      const v = c.buf.readDoubleLE(c.pos);
      c.pos += 8;
      return v;
    }
    case DbType.Guid: {
      const v = c.buf.subarray(c.pos, c.pos + 16);
      c.pos += 16;
      return formatGuid(v);
    }
    case DbType.Sha1: {
      const v = Buffer.from(c.buf.subarray(c.pos, c.pos + 20));
      c.pos += 20;
      return v;
    }
    case DbType.Blob: {
      const len = c.leb128();
      const v = Buffer.from(c.buf.subarray(c.pos, c.pos + len));
      c.pos += len;
      return v;
    }
    default:
      throw new Error(`DbObject: unhandled type ${type} at ${c.pos}`);
  }
}

function formatGuid(b: Buffer): string {
  // Microsoft mixed-endian GUID text form.
  const hex = (n: number, w: number) => n.toString(16).padStart(w, '0');
  return (
    hex(b.readUInt32LE(0), 8) +
    '-' +
    hex(b.readUInt16LE(4), 4) +
    '-' +
    hex(b.readUInt16LE(6), 4) +
    '-' +
    b.subarray(8, 10).toString('hex') +
    '-' +
    b.subarray(10, 16).toString('hex')
  );
}

export function parseDbObject(payload: Buffer): DbValue {
  const c = new Cursor(payload);
  const t = c.u8();
  if ((t & 0x80) === 0) c.cstring(); // named root (unusual)
  return readDbEntry(c, t & 0x1f);
}

// ---------------------------------------------------------------------------
// layout.toc — install chunks (persistentIndex -> cas directory)
// ---------------------------------------------------------------------------

export interface GameLayout {
  gameRoot: string;
  superBundles: string[];
  /** persistentIndex -> installBundle relative dir (e.g. win32/superbundlelayout/football_installpackage_00) */
  installChunks: Map<number, { name: string; installBundle: string }>;
  head: number;
}

export function loadLayout(gameRoot: string): GameLayout {
  const layoutPath = path.join(gameRoot, 'Data', 'layout.toc');
  if (!fs.existsSync(layoutPath)) {
    throw new Error(
      "game install not found at " + gameRoot +
        " — set the game folder in the app's Setup tab, or export CFB_GAME_ROOT"
    );
  }
  const root = parseDbObject(readTocPayload(layoutPath)) as { [key: string]: DbValue };
  const superBundles = ((root.superBundles as DbValue[]) ?? []).map(
    (e) => (e as { name: string }).name,
  );
  const installChunks = new Map<number, { name: string; installBundle: string }>();
  const manifest = root.installManifest as { [key: string]: DbValue } | undefined;
  if (manifest && Array.isArray(manifest.installChunks)) {
    for (const entryVal of manifest.installChunks) {
      const entry = entryVal as { [key: string]: DbValue };
      if (entry.testDLC) continue;
      // Keys normalized to uint32 — this title references install chunks from bundle
      // records by their (hash-valued) persistentIndex.
      const persistentIndex = Number(entry.persistentIndex ?? installChunks.size) >>> 0;
      installChunks.set(persistentIndex, {
        name: String(entry.name ?? ''),
        installBundle: String(entry.installBundle ?? ''),
      });
    }
  }
  return { gameRoot, superBundles, installChunks, head: Number(root.head ?? 0) };
}

// ---------------------------------------------------------------------------
// Huffman-coded bundle names (Manifest2019 toc)
// ---------------------------------------------------------------------------

class HuffmanDecoder {
  private root: HuffNode | null = null;
  private words: Int32Array | null = null;

  readTable(buf: Buffer, offset: number, count: number) {
    const nodes: HuffNode[] = [];
    let left: HuffNode | null = null;
    let nodeValue = 0;
    this.root = null;
    for (let i = 0; i < count; i++) {
      const value = buf.readUInt32BE(offset + i * 4);
      let node = nodes.find((n) => n.value === value);
      const existed = !!node;
      if (!node) node = { value, left: null, right: null };
      if (left === null) {
        left = node;
        if (!existed) nodes.push(node);
      } else {
        if (!existed) nodes.push(node);
        const parent: HuffNode = { value: nodeValue++, left, right: node };
        this.root = parent;
        nodes.push(parent);
        left = null;
      }
    }
  }

  readData(buf: Buffer, offset: number, wordCount: number) {
    this.words = new Int32Array(wordCount);
    for (let i = 0; i < wordCount; i++) {
      this.words[i] = buf.readInt32BE(offset + i * 4);
    }
  }

  decode(bitIndex: number): string {
    if (!this.root || !this.words) throw new Error('huffman: not initialized');
    const totalBits = this.words.length * 32;
    let out = '';
    for (;;) {
      let node: HuffNode = this.root;
      while ((node.left || node.right) && bitIndex < totalBits) {
        const bit = (this.words[bitIndex >> 5] >> (bitIndex & 31)) & 1;
        node = (bit === 0 ? node.left : node.right)!;
        bitIndex++;
      }
      const letter = ~node.value & 0xff;
      if (letter === 0 || bitIndex >= totalBits) return out;
      out += String.fromCharCode(letter);
    }
  }
}

interface HuffNode {
  value: number;
  left: HuffNode | null;
  right: HuffNode | null;
}

// ---------------------------------------------------------------------------
// Manifest2019 superbundle toc + binary bundles
// ---------------------------------------------------------------------------

export interface CasIdent {
  isPatch: boolean;
  installChunkIndex: number;
  casIndex: number;
}

export interface CasLocation {
  ident: CasIdent;
  offset: number;
  size: number;
}

export interface SbBundleEntry {
  name: string;
  offset: number;
  size: number;
  /** 1 = bundle data inline in the .toc, 0 = in the companion .sb file */
  loadFlag: number;
}

export interface SbChunkEntry {
  guid: string;
  location: CasLocation;
}

export interface SuperbundleToc {
  bundles: SbBundleEntry[];
  chunks: SbChunkEntry[];
}

function casIdentFromU32(v: number): CasIdent {
  return {
    isPatch: ((v >>> 16) & 0xff) !== 0,
    installChunkIndex: (v >>> 8) & 0xff,
    casIndex: v & 0xff,
  };
}

function casIdentFromU32Pair(v1: number, v2: number): CasIdent {
  return {
    isPatch: ((v1 >>> 16) & 0xff) !== 0,
    installChunkIndex: (((v1 << 16) & 0xffff0000) | ((v2 >>> 16) & 0xffff)) >>> 0,
    casIndex: v2 & 0xffff,
  };
}

/**
 * 64-bit file identifier (location flag 0x84, used by this title):
 * isPatch = bits 48-55, installChunkIndex = bits 16-47 (the install chunk's
 * uint32 persistentIndex), casIndex = bits 0-15.
 */
function casIdentFromU64(hi: number, lo: number): CasIdent {
  return {
    isPatch: ((hi >>> 16) & 0xff) !== 0,
    installChunkIndex: ((((hi & 0xffff) << 16) >>> 0) | (lo >>> 16)) >>> 0,
    casIndex: lo & 0xffff,
  };
}

export function parseSuperbundleToc(payload: Buffer): SuperbundleToc {
  let p = 0;
  const u32 = () => {
    const v = payload.readUInt32BE(p);
    p += 4;
    return v;
  };
  const i32 = () => {
    const v = payload.readInt32BE(p);
    p += 4;
    return v;
  };

  u32(); // bundleHashMapOffset
  const bundleDataOffset = u32();
  const bundlesCount = i32();
  u32(); // chunkHashMapOffset
  const chunkGuidOffset = u32();
  const chunksCount = i32();
  u32(); // unknown
  u32(); // unknown
  u32(); // namesOffset (uncompressed name table; unused when huffman flag set)
  const chunkDataOffset = u32();
  const dataCount = i32();
  const flags = i32();

  const hasCompressedNames = (flags & 4) !== 0;
  let huffman: HuffmanDecoder | null = null;
  let namesOffsetRaw = 0;
  if (hasCompressedNames) {
    const namesCount = u32(); // count of 32-bit words of encoded data
    const tableCount = u32();
    const tableOffset = u32();
    // Ordering matches the loader: encoded data lives at the (reused) namesOffset field.
    namesOffsetRaw = payload.readUInt32BE(8 * 4);
    huffman = new HuffmanDecoder();
    huffman.readData(payload, namesOffsetRaw, namesCount);
    huffman.readTable(payload, tableOffset, tableCount);
  } else {
    namesOffsetRaw = payload.readUInt32BE(8 * 4);
  }

  const bundles: SbBundleEntry[] = [];
  p = bundleDataOffset;
  for (let i = 0; i < bundlesCount; i++) {
    const nameOffset = i32();
    let size = u32();
    const offsetHi = u32();
    const offsetLo = u32();
    const offset = offsetHi * 0x100000000 + offsetLo;
    const loadFlag = size >>> 30;
    size &= 0x3fffffff;
    let name: string;
    if (hasCompressedNames) {
      name = huffman!.decode(nameOffset);
    } else {
      const end = payload.indexOf(0, namesOffsetRaw + nameOffset);
      name = payload.toString('utf8', namesOffsetRaw + nameOffset, end);
    }
    bundles.push({ name, offset, size, loadFlag });
  }

  const chunks: SbChunkEntry[] = [];
  if (chunksCount > 0) {
    const chunkData: number[] = [];
    for (let i = 0; i < dataCount; i++) {
      // stored little-endian, loader byte-swaps on use
      chunkData.push(payload.readUInt32LE(chunkDataOffset + i * 4));
    }
    const removed = new Set<string>();
    p = chunkGuidOffset;
    for (let i = 0; i < chunksCount; i++) {
      const guidBytes = Buffer.from(payload.subarray(p, p + 16));
      p += 16;
      guidBytes.reverse();
      const guid = formatGuid(guidBytes);
      let index = payload.readInt32BE(p);
      p += 4;
      if (index === -1) {
        removed.add(guid);
        continue;
      }
      if (removed.has(guid)) continue;
      const identFlag = (index >>> 24) & 0xff;
      index &= 0x00ffffff;
      const swap = (v: number) =>
        (((v & 0xff) << 24) | ((v & 0xff00) << 8) | ((v >>> 8) & 0xff00) | ((v >>> 24) & 0xff)) >>>
        0;
      let ident: CasIdent;
      if (identFlag === 1) {
        ident = casIdentFromU32(swap(chunkData[index++]));
      } else if (identFlag === 0x80) {
        ident = casIdentFromU32Pair(swap(chunkData[index]), swap(chunkData[index + 1]));
        index += 2;
      } else {
        throw new Error(`chunk file identifier flag ${identFlag}`);
      }
      const offset = swap(chunkData[index++]);
      const size = swap(chunkData[index]);
      chunks.push({ guid, location: { ident, offset, size } });
    }
  }

  return { bundles, chunks };
}

// ---------------------------------------------------------------------------
// Binary bundle meta (asset lists inside a bundle)
// ---------------------------------------------------------------------------

const BUNDLE_SALT = 0x7065636e; // "pecn" — Frostbite 2017+
const BUNDLE_MAGIC_STANDARD = 0xed1cedb8;
const BUNDLE_MAGIC_KELVIN = 0xc3889333;
const BUNDLE_MAGIC_ENCRYPTED = 0xc3e5d5c3;

export interface BundleAsset {
  kind: 'ebx' | 'res' | 'chunk';
  name: string; // chunk guid text for chunks
  originalSize: number;
  location: CasLocation | null;
  resType?: number;
  resMeta?: Buffer;
}

export interface ParsedBundle {
  name: string;
  assets: BundleAsset[];
}

interface BundleMetaEntry {
  kind: 'ebx' | 'res' | 'chunk';
  name: string;
  originalSize: number;
  resType?: number;
  resMeta?: Buffer;
}

function swap32(v: number): number {
  return (
    (((v & 0xff) << 24) | ((v & 0xff00) << 8) | ((v >>> 8) & 0xff00) | ((v >>> 24) & 0xff)) >>> 0
  );
}

function parseBinaryBundleMeta(buf: Buffer, start: number): BundleMetaEntry[] {
  let p = start;
  const size = buf.readUInt32BE(p);
  p += 4;
  const startPos = p;
  let little = false;
  let magic = (buf.readUInt32BE(p) ^ BUNDLE_SALT) >>> 0;
  p += 4;
  if (
    magic !== BUNDLE_MAGIC_STANDARD &&
    magic !== BUNDLE_MAGIC_KELVIN &&
    magic !== BUNDLE_MAGIC_ENCRYPTED
  ) {
    magic = (swap32((magic ^ BUNDLE_SALT) >>> 0) ^ BUNDLE_SALT) >>> 0;
    little = true;
    if (
      magic !== BUNDLE_MAGIC_STANDARD &&
      magic !== BUNDLE_MAGIC_KELVIN &&
      magic !== BUNDLE_MAGIC_ENCRYPTED
    ) {
      throw new Error(`bundle meta: bad magic at ${start}`);
    }
  }
  if (magic === BUNDLE_MAGIC_ENCRYPTED) {
    throw new Error('bundle meta: encrypted bundles not supported');
  }
  const u32 = () => {
    const v = little ? buf.readUInt32LE(p) : buf.readUInt32BE(p);
    p += 4;
    return v;
  };
  const containsSha1 = magic === BUNDLE_MAGIC_STANDARD;
  const totalCount = u32();
  const ebxCount = u32();
  const resCount = u32();
  const chunkCount = u32();
  const stringsOffset = u32() + startPos;
  p += 8; // metaOffset + metaSize

  if (containsSha1) p += totalCount * 20;

  const readName = (nameOffset: number): string => {
    const at = stringsOffset + nameOffset;
    const end = buf.indexOf(0, at);
    return buf.toString('utf8', at, end);
  };

  const entries: BundleMetaEntry[] = [];
  for (let i = 0; i < ebxCount; i++) {
    const nameOffset = u32();
    const originalSize = u32();
    entries.push({ kind: 'ebx', name: readName(nameOffset), originalSize });
  }
  const resFixedBase = p + resCount * 8;
  for (let i = 0; i < resCount; i++) {
    const nameOffset = u32();
    const originalSize = u32();
    const resType = little
      ? buf.readUInt32LE(resFixedBase + i * 4)
      : buf.readUInt32BE(resFixedBase + i * 4);
    const resMeta = Buffer.from(
      buf.subarray(resFixedBase + resCount * 4 + i * 0x10, resFixedBase + resCount * 4 + i * 0x10 + 0x10),
    );
    entries.push({ kind: 'res', name: readName(nameOffset), originalSize, resType, resMeta });
  }
  // skip res type/meta/rid arrays
  p = resFixedBase + resCount * 4 + resCount * 0x10 + resCount * 8;
  for (let i = 0; i < chunkCount; i++) {
    const rawGuid = Buffer.from(buf.subarray(p, p + 16));
    p += 16;
    const logicalOffset = little ? rawGuid.length && buf.readUInt32LE(p) : buf.readUInt32BE(p);
    p += 4;
    const logicalSize = little ? buf.readUInt32LE(p) : buf.readUInt32BE(p);
    p += 4;
    // Bundle guids are stored in .NET layout when little-endian; formatGuid expects that layout.
    const guid = little ? formatGuid(rawGuid) : formatGuid(Buffer.from(rawGuid).reverse());
    entries.push({
      kind: 'chunk',
      name: guid,
      originalSize: (logicalOffset & 0xffff) + logicalSize,
    });
  }
  void size;
  return entries;
}

/**
 * Parse one bundle body from a Manifest2019 superbundle (loadFlag 1 — bundle record
 * inline in the .toc). The bundle *meta* (asset name lists) is either inline too, or
 * stored raw in a cas file, in which case the first location entry points at it and
 * `readRawCas` is required.
 */
export function parseBundle(
  payload: Buffer,
  entry: SbBundleEntry,
  readRawCas?: (loc: CasLocation) => Buffer,
): ParsedBundle {
  const base = entry.offset;
  const bundleOffset = payload.readInt32BE(base);
  const bundleSize = payload.readInt32BE(base + 4);
  const locationOffset = payload.readUInt32BE(base + 8);
  const totalCount = payload.readInt32BE(base + 12);
  const dataOffset = payload.readUInt32BE(base + 16);

  const flags = payload.subarray(base + locationOffset, base + locationOffset + totalCount);

  let p = base + dataOffset;
  let current: CasIdent | null = null;
  let flagIndex = 0;

  const readLocation = (): CasLocation => {
    const flag = flags[flagIndex++];
    if (flag === 1) {
      current = casIdentFromU32(payload.readUInt32BE(p));
      p += 4;
    } else if (flag === 0x80) {
      current = casIdentFromU32Pair(payload.readUInt32BE(p), payload.readUInt32BE(p + 4));
      p += 8;
    } else if (flag === 0x84) {
      current = casIdentFromU64(payload.readUInt32BE(p), payload.readUInt32BE(p + 4));
      p += 8;
    } else if (flag !== 0) {
      throw new Error(`bundle ${entry.name}: file identifier flag ${flag}`);
    }
    if (!current) throw new Error(`bundle ${entry.name}: location without file identifier`);
    const offset = payload.readUInt32BE(p);
    p += 4;
    const size = payload.readUInt32BE(p);
    p += 4;
    return { ident: current, offset, size };
  };

  const inline = !(bundleOffset === 0 && bundleSize === 0);
  let meta: BundleMetaEntry[];
  if (inline) {
    meta = parseBinaryBundleMeta(payload, base + bundleOffset);
  } else {
    if (!readRawCas) {
      throw new Error(`bundle ${entry.name}: meta stored in cas — readRawCas required`);
    }
    const metaLoc = readLocation();
    const metaBuf = readRawCas(metaLoc);
    meta = parseBinaryBundleMeta(metaBuf, 0);
  }

  const assets: BundleAsset[] = [];
  for (const m of meta) {
    assets.push({ ...m, location: readLocation() });
  }
  return { name: entry.name, assets };
}

/** Read raw bytes (no decompression) out of a cas file. */
export function readRawCasBytes(layout: GameLayout, loc: CasLocation): Buffer {
  const filePath = casFilePath(layout, loc.ident);
  const fd = fs.openSync(filePath, 'r');
  try {
    const buf = Buffer.alloc(loc.size);
    fs.readSync(fd, buf, 0, loc.size, loc.offset);
    return buf;
  } finally {
    fs.closeSync(fd);
  }
}

// ---------------------------------------------------------------------------
// CAS data + decompression
// ---------------------------------------------------------------------------

let oodleDecompress:
  | ((src: Buffer, dst: Buffer, dstSize: number) => number)
  | null
  | undefined;

async function getOodle(gameRoot: string) {
  if (oodleDecompress !== undefined) return oodleDecompress;
  try {
    const koffi = (await import('koffi')).default;
    const lib = koffi.load(path.join(gameRoot, 'oo2core_9_win64.dll'));
    const fn = lib.func(
      'int64 OodleLZ_Decompress(const uint8_t *compBuf, int64 compBufSize, _Out_ uint8_t *rawBuf, int64 rawLen, int32 fuzzSafe, int32 checkCRC, int32 verbosity, void *decBufBase, int64 decBufSize, void *fpCallback, void *cbUserData, void *decoderMemory, int64 decoderMemorySize, int32 threadPhase)',
    );
    oodleDecompress = (src, dst, dstSize) =>
      Number(fn(src, src.length, dst, dstSize, 1, 0, 0, null, 0n, null, null, null, 0n, 3));
  } catch (err) {
    oodleDecompress = null;
    throw new Error(`failed to load oo2core_9_win64.dll via koffi: ${err}`);
  }
  return oodleDecompress;
}

export function casFilePath(layout: GameLayout, ident: CasIdent): string {
  const chunk = layout.installChunks.get(ident.installChunkIndex);
  if (!chunk) throw new Error(`no install chunk with persistentIndex ${ident.installChunkIndex}`);
  const casName = `cas_${String(ident.casIndex).padStart(2, '0')}.cas`;
  // No Patch source in this install — Steam updates rewrite the base files in place.
  return path.join(layout.gameRoot, 'Data', chunk.installBundle, casName);
}

/**
 * Read one asset out of a cas file and decompress its block stream.
 * Block header: u64 BE — flags(8) | decompressedSize(24) | compressionType(8) | 0x7(4) | bufferSize(20).
 */
export async function readCasAsset(
  layout: GameLayout,
  location: CasLocation,
  originalSize: number,
): Promise<Buffer> {
  const filePath = casFilePath(layout, location.ident);
  const fd = fs.openSync(filePath, 'r');
  try {
    const compressed = Buffer.alloc(location.size);
    fs.readSync(fd, compressed, 0, location.size, location.offset);
    return await decompressCasBlocks(layout, compressed, originalSize);
  } finally {
    fs.closeSync(fd);
  }
}

export async function decompressCasBlocks(
  layout: GameLayout,
  compressed: Buffer,
  originalSize: number,
): Promise<Buffer> {
  const out = Buffer.alloc(originalSize);
  let outPos = 0;
  let p = 0;
  while (p < compressed.length && outPos < originalSize) {
    const hi = compressed.readUInt32BE(p);
    const lo = compressed.readUInt32BE(p + 4);
    p += 8;
    if (hi === 0 && lo === 0) continue;
    const decompressedSize = hi & 0x00ffffff;
    const compressionType = (lo >>> 24) & 0x7f;
    if (((lo >>> 20) & 0xf) !== 7) {
      throw new Error(`cas block: bad marker at ${p - 8} (lo=0x${lo.toString(16)})`);
    }
    let bufferSize = lo & 0x000fffff;
    if (compressionType === 0) bufferSize = decompressedSize;
    const block = compressed.subarray(p, p + bufferSize);
    p += bufferSize;
    switch (compressionType) {
      case 0x00: // none
        block.copy(out, outPos);
        break;
      case 0x02: {
        // zlib
        zlib.inflateSync(block).copy(out, outPos);
        break;
      }
      case 0x0f: {
        // zstd
        const zstd = (zlib as unknown as { zstdDecompressSync?: (b: Buffer) => Buffer })
          .zstdDecompressSync;
        if (!zstd) throw new Error('cas block: zstd not supported by this Node build');
        zstd(block).copy(out, outPos);
        break;
      }
      case 0x11: // oodle kraken
      case 0x15: // oodle selkie
      case 0x19: {
        // oodle leviathan
        const oodle = await getOodle(layout.gameRoot);
        if (!oodle) throw new Error('oodle unavailable');
        const dst = out.subarray(outPos, outPos + decompressedSize);
        const n = oodle(block, dst, decompressedSize);
        if (n !== decompressedSize) {
          throw new Error(`oodle decompress returned ${n}, expected ${decompressedSize}`);
        }
        break;
      }
      default:
        throw new Error(`cas block: unhandled compression type 0x${compressionType.toString(16)}`);
    }
    outPos += decompressedSize;
  }
  if (outPos !== originalSize) {
    throw new Error(`cas asset: decompressed ${outPos} bytes, expected ${originalSize}`);
  }
  return out;
}

/**
 * Decompress a cas block stream without knowing the decompressed size up front
 * — superbundle chunk entries carry only their compressed extent. Stops cleanly
 * at the first thing that is not a block header instead of throwing.
 */
export async function decompressCasBlocksUnknownSize(
  layout: GameLayout,
  compressed: Buffer,
): Promise<Buffer> {
  const parts: Buffer[] = [];
  let p = 0;
  while (p + 8 <= compressed.length) {
    const hi = compressed.readUInt32BE(p);
    const lo = compressed.readUInt32BE(p + 4);
    if (hi === 0 && lo === 0) {
      p += 8;
      continue;
    }
    const decompressedSize = hi & 0x00ffffff;
    const compressionType = (lo >>> 24) & 0x7f;
    if (((lo >>> 20) & 0xf) !== 7) break;
    let bufferSize = lo & 0x000fffff;
    if (compressionType === 0) bufferSize = decompressedSize;
    if (p + 8 + bufferSize > compressed.length) break;
    const block = compressed.subarray(p + 8, p + 8 + bufferSize);
    p += 8 + bufferSize;
    const dst = Buffer.alloc(decompressedSize);
    switch (compressionType) {
      case 0x00:
        block.copy(dst);
        break;
      case 0x02:
        zlib.inflateSync(block).copy(dst);
        break;
      case 0x0f: {
        const zstd = (zlib as unknown as { zstdDecompressSync?: (b: Buffer) => Buffer })
          .zstdDecompressSync;
        if (!zstd) throw new Error('cas block: zstd not supported by this Node build');
        zstd(block).copy(dst);
        break;
      }
      case 0x11:
      case 0x15:
      case 0x19: {
        const oodle = await getOodle(layout.gameRoot);
        if (!oodle) throw new Error('oodle unavailable');
        const n = oodle(block, dst, decompressedSize);
        if (n !== decompressedSize) throw new Error(`oodle returned ${n}/${decompressedSize}`);
        break;
      }
      default:
        throw new Error(`cas block: unhandled compression type 0x${compressionType.toString(16)}`);
    }
    parts.push(dst);
  }
  return Buffer.concat(parts);
}

/**
 * The resolved game install every script reads from: the app's Setup choice
 * first (settings.json gameDir), then the CFB_GAME_ROOT env override, then
 * the stock locations and every Steam library. Falls back to the stock Steam
 * path so error messages still name a concrete folder when nothing is found.
 */
export const GAME_ROOT_DEFAULT =
  locateGameRoot(settingsGameDir()).root ?? GAME_ROOT_FALLBACK;
