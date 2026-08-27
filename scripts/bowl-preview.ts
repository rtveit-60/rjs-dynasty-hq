/**
 * Developer tool: render every bowl mark to an HTML contact sheet for visual QA.
 * Pulls the real bowl names and brand colors out of a save so the sheet shows
 * exactly what the app will draw.
 *
 * Usage: node scripts/bowl-preview.ts [save] [out.html]
 */
import { writeFileSync } from 'node:fs';
import { BOWL_ART, bowlArtKey, readable, type BowlShape } from '../src/renderer/src/lib/bowl-art.ts';
import { isPlayoffRound } from '../src/renderer/src/lib/cfp-mark.ts';
import { loadFranchise, tablesByName, val } from '../src/main/parser/franchise.ts';

const savePath = process.argv[2] ?? 'samples/DYNASTY-DUKETOND';
const outPath = process.argv[3] ?? 'bowl-preview.html';

const rgb = (r: unknown, g: unknown, b: unknown) =>
  '#' + [r, g, b].map((n) => Math.max(0, Math.min(255, Number(n) || 0)).toString(16).padStart(2, '0')).join('');

function svg(shapes: BowlShape[], primaryIn: string, secondaryIn: string, size: number): string {
  const primary = readable(primaryIn);
  const secondary = readable(secondaryIn);
  const parts = shapes.map((s) => {
    const c = s.alt ? secondary : primary;
    switch (s.t) {
      case 'c':
        return `<circle cx="${s.x}" cy="${s.y}" r="${s.r}" fill="${c}"/>`;
      case 'e':
        return `<ellipse cx="${s.x}" cy="${s.y}" rx="${s.rx}" ry="${s.ry}" fill="${c}"${s.rot ? ` transform="rotate(${s.rot} ${s.x} ${s.y})"` : ''}/>`;
      case 'r':
        return `<rect x="${s.x}" y="${s.y}" width="${s.w}" height="${s.h}" rx="${s.rx ?? 0}" fill="${c}"/>`;
      case 'p':
        return `<path d="${s.d}" fill="${c}" fill-rule="evenodd"/>`;
      case 'l':
        return `<path d="${s.d}" fill="none" stroke="${c}" stroke-width="${s.w ?? 1.4}" stroke-linecap="round" stroke-linejoin="round"/>`;
    }
  });
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24">${parts.join('')}</svg>`;
}

// Pull real bowl identities + colors from the save.
const franchise = await loadFranchise(savePath);
const bowls: { name: string; asset: string; primary: string; secondary: string }[] = [];
const seen = new Set<string>();
for (const tname of ['BowlGame', 'PlayoffBowlsInfo']) {
  const t = tablesByName(franchise, tname).sort(
    (a: any, b: any) => (b.header?.recordCapacity ?? 0) - (a.header?.recordCapacity ?? 0)
  )[0];
  if (!t) continue;
  await t.readRecords();
  for (const r of t.records ?? []) {
    if (r.isEmpty) continue;
    const name = String(val(r, 'Name') ?? '').trim();
    if (!name || seen.has(name)) continue;
    seen.add(name);
    bowls.push({
      name,
      asset: String(val(r, 'AssetName') ?? '').trim(),
      primary: rgb(val(r, 'BOWL_PRIMARY_COLOR_R'), val(r, 'BOWL_PRIMARY_COLOR_G'), val(r, 'BOWL_PRIMARY_COLOR_B')),
      secondary: rgb(
        val(r, 'BOWL_SECONDARY_COLOR_R'),
        val(r, 'BOWL_SECONDARY_COLOR_G'),
        val(r, 'BOWL_SECONDARY_COLOR_B')
      )
    });
  }
}
bowls.sort((a, b) => a.name.localeCompare(b.name));

const cells = bowls
  .filter((b) => !isPlayoffRound(b.name))
  .map((b) => {
    const key = bowlArtKey(b.asset, b.name);
    const shapes = key ? BOWL_ART[key] : null;
    const missing = !shapes || key === 'Generic';
    if (!shapes) return '';
    return `<div class="cell${missing ? ' miss' : ''}">
      <div class="big">${svg(shapes, b.primary, b.secondary, 64)}</div>
      <div class="row">${svg(shapes, b.primary, b.secondary, 16)}${svg(shapes, b.primary, b.secondary, 12)}</div>
      <div class="nm">${b.name}</div>
      <div class="k">${key}</div>
    </div>`;
  })
  .join('\n');

const unused = Object.keys(BOWL_ART).filter(
  (k) => !bowls.some((b) => bowlArtKey(b.asset, b.name) === k)
);

writeFileSync(
  outPath,
  `<!doctype html><meta charset="utf-8"><title>Bowl marks</title>
<style>
 :root{--ink:#e9e7e2}
 body{background:#121212;color:#e9e7e2;font:13px/1.5 system-ui,sans-serif;margin:24px}
 h1{font-size:16px;letter-spacing:.12em;text-transform:uppercase}
 .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:14px;margin-top:18px}
 .cell{border:1px solid #2c2c2c;border-radius:8px;padding:12px;text-align:center;background:#1a1a1a}
 .cell.miss{border-color:#a3392f}
 .big{height:70px;display:flex;align-items:center;justify-content:center}
 .row{display:flex;gap:10px;align-items:center;justify-content:center;height:22px;opacity:.95}
 .nm{margin-top:8px;font-weight:600;font-size:12px}
 .k{color:#8b8b86;font-size:10.5px;font-family:ui-monospace,monospace}
 .light{background:#f7f5f0;color:#22211f;--ink:#22211f}
 .light .cell{background:#fff;border-color:#dcd8d0}
 .note{color:#8b8b86;margin-top:20px;font-size:12px}
</style>
<h1>Bowl marks — ${bowls.length} bowls from ${savePath}</h1>
<div class="grid">${cells}</div>
<div class="note">Red border = falling back to the generic football. Unused art keys: ${unused.join(', ') || 'none'}</div>
<div class="light" style="margin-top:28px;padding:20px;border-radius:10px">
<h1>Light mode</h1><div class="grid">${cells}</div></div>
`,
  'utf8'
);
console.log(`wrote ${outPath} — ${bowls.length} bowls, ${unused.length} unused keys`);
