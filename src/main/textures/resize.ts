/**
 * Area-average RGBA downscale ("box" resampling) — the standard filter for
 * shrinking: every destination pixel is the coverage-weighted mean of the
 * source pixels its cell spans, so nothing is dropped or aliased. Only used
 * to thumbnail extracted textures (portraits); never for upscaling, where
 * the caller keeps the source size instead.
 */
export function resizeRgba(
  src: Buffer,
  sw: number,
  sh: number,
  dw: number,
  dh: number
): Buffer {
  const out = Buffer.alloc(dw * dh * 4);
  const xr = sw / dw;
  const yr = sh / dh;
  for (let dy = 0; dy < dh; dy++) {
    const y0 = dy * yr;
    const y1 = Math.min((dy + 1) * yr, sh);
    for (let dx = 0; dx < dw; dx++) {
      const x0 = dx * xr;
      const x1 = Math.min((dx + 1) * xr, sw);
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let area = 0;
      for (let sy = Math.floor(y0); sy < y1; sy++) {
        const cy = Math.min(sy + 1, y1) - Math.max(sy, y0);
        for (let sx = Math.floor(x0); sx < x1; sx++) {
          const w = (Math.min(sx + 1, x1) - Math.max(sx, x0)) * cy;
          const o = (sy * sw + sx) * 4;
          r += src[o] * w;
          g += src[o + 1] * w;
          b += src[o + 2] * w;
          a += src[o + 3] * w;
          area += w;
        }
      }
      const o = (dy * dw + dx) * 4;
      out[o] = Math.round(r / area);
      out[o + 1] = Math.round(g / area);
      out[o + 2] = Math.round(b / area);
      out[o + 3] = Math.round(a / area);
    }
  }
  return out;
}

/** Shrink to fit within max×max, preserving aspect; returns input unchanged if it already fits. */
export function thumbnailRgba(
  src: Buffer,
  sw: number,
  sh: number,
  max: number
): { data: Buffer; width: number; height: number } {
  if (sw <= max && sh <= max) return { data: src, width: sw, height: sh };
  const scale = Math.min(max / sw, max / sh);
  const dw = Math.max(1, Math.round(sw * scale));
  const dh = Math.max(1, Math.round(sh * scale));
  return { data: resizeRgba(src, sw, sh, dw, dh), width: dw, height: dh };
}
