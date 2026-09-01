import { decodeBC1, decodeBC3, decodeBC7 } from '../../src/main/textures/bcn.ts';
import { encodePng } from '../../src/main/textures/png.ts';

/**
 * Shared texture handling for the extraction tools: classify a Frostbite
 * texture resource (format id + payload size → concrete BCn format, slicing
 * a full mip chain down to its top level), decode it in-process, and hand
 * back PNG bytes. This is the seam where the Python/Pillow dependency used
 * to live — decoding is now the app's own TypeScript (src/main/textures),
 * verified byte-for-byte against Pillow by scripts/bc-check.ts.
 */

export interface TexInfo {
  dxgi: 71 | 77 | 98 | 99;
  width: number;
  height: number;
  data: Buffer;
}

/**
 * BC7 carries its format id in the res header (0x42, 0x43 sRGB); everything
 * else is inferred from bytes-per-pixel (BC1 packs half a byte per pixel,
 * BC3 a full byte), and a payload ~4/3 the single-level size is a full mip
 * chain whose top level leads.
 */
export function classifyTexture(
  format: number,
  width: number,
  height: number,
  pixels: Buffer
): TexInfo | null {
  const bc3 = width * height;
  const bc1 = bc3 / 2;
  const bc7 = bc3; // BC7 is 16 bytes per 4x4 block = 1 byte/pixel, like BC3
  if (format === 0x42 || format === 0x43) {
    const dxgi = format === 0x42 ? 98 : 99;
    if (pixels.length === bc7) return { dxgi, width, height, data: pixels };
    if (pixels.length > bc7 && pixels.length < bc7 * 1.4) {
      return { dxgi, width, height, data: pixels.subarray(0, bc7) };
    }
    return null;
  }
  if (pixels.length === bc1) return { dxgi: 71, width, height, data: pixels };
  if (pixels.length === bc3) return { dxgi: 77, width, height, data: pixels };
  if (pixels.length > bc3 && pixels.length < bc3 * 1.4) {
    return { dxgi: 77, width, height, data: pixels.subarray(0, bc3) };
  }
  if (pixels.length > bc1 && pixels.length < bc1 * 1.4) {
    return { dxgi: 71, width, height, data: pixels.subarray(0, bc1) };
  }
  return null;
}

export function decodeToRgba(t: TexInfo): Buffer {
  if (t.dxgi === 71) return decodeBC1(t.data, t.width, t.height);
  if (t.dxgi === 77) return decodeBC3(t.data, t.width, t.height);
  return decodeBC7(t.data, t.width, t.height);
}

/** Decode a classified texture straight to PNG bytes. */
export function texturePng(t: TexInfo): Buffer {
  return encodePng(decodeToRgba(t), t.width, t.height);
}

/** Wrap raw BCn payload as a DX10 DDS (used by bc-check's Pillow oracle). */
export function ddsWrap(t: TexInfo): Buffer {
  const hdr = Buffer.alloc(148);
  hdr.write('DDS ', 0, 'latin1');
  hdr.writeUInt32LE(124, 4);
  hdr.writeUInt32LE(0x81007, 8);
  hdr.writeUInt32LE(t.height, 12);
  hdr.writeUInt32LE(t.width, 16);
  hdr.writeUInt32LE(t.data.length, 20);
  hdr.writeUInt32LE(1, 28);
  hdr.writeUInt32LE(32, 76);
  hdr.writeUInt32LE(0x4, 80);
  hdr.write('DX10', 84, 'latin1');
  hdr.writeUInt32LE(0x1000, 108);
  hdr.writeUInt32LE(t.dxgi, 128);
  hdr.writeUInt32LE(3, 132);
  hdr.writeUInt32LE(1, 140);
  return Buffer.concat([hdr, t.data]);
}
