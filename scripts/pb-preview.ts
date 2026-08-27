/**
 * Render a grid of play-art SVGs (mirroring src/renderer/src/components/PlayArt.tsx) to an
 * HTML file for visual verification. Reads the bundled gzipped books. Dev tool.
 * Usage: node scripts/pb-preview.ts [outHtml]
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import type { PlaybookFormation, PlaybookPlay, PlaybookPlayer } from '../src/shared/types.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const out = process.argv[2] ?? path.join(__dirname, '..', 'pb-preview.html');
const booksDir = path.join(__dirname, '..', 'resources', 'playbooks', 'books');

const PX = 11,
  PAD = 2.6,
  DEPTH_CAP = 24,
  MIN_HALF_WIDTH = 16,
  HASH_X = 6.67;
const POS: Record<string, string> = {
  QB: '#e24a84',
  RB: '#13b5a2',
  WR: '#3b82f6',
  SL: '#3b82f6',
  TE: '#f0a028',
  OL: '#8b9099',
  DL: '#e2555a',
  LB: '#f0a028',
  DB: '#3b82f6'
};
type Pt = { x: number; y: number };

function clipDepth(points: Pt[]): Pt[] {
  const o: Pt[] = [];
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    if (Math.abs(p.y) <= DEPTH_CAP) {
      o.push(p);
      continue;
    }
    const prev = points[i - 1];
    if (prev && Math.abs(prev.y) <= DEPTH_CAP) {
      const cap = p.y > 0 ? DEPTH_CAP : -DEPTH_CAP;
      const t = (cap - prev.y) / (p.y - prev.y);
      o.push({ x: prev.x + (p.x - prev.x) * t, y: cap });
    }
    break;
  }
  return o;
}
function label(p: PlaybookPlayer, side: 'offense' | 'defense'): string | null {
  if (side === 'defense') return p.y <= 2.8 ? 'DL' : p.y <= 7 ? 'LB' : 'DB';
  if (p.posType === 1) return 'QB';
  if (p.posType === 4) return null;
  if (p.y <= -3.5) return 'HB';
  if (Math.abs(p.x) >= 11) return 'WR';
  if (Math.abs(p.x) <= 7) return 'TE';
  return 'SL';
}
const posColor = (l: string | null) => (!l ? POS.OL : POS[l] ?? (l === 'HB' ? POS.RB : POS.WR));
function ink(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  const lum = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return lum > 0.6 ? '#141210' : '#fff';
}

function svg(formation: PlaybookFormation, play: PlaybookPlay, side: 'offense' | 'defense'): string {
  const align = formation.alignment;
  const routes = play.routes.map((rt) => clipDepth(rt.points));
  const pts: Pt[] = [...align];
  for (const rt of routes) pts.push(...rt);
  const xHalf = Math.max(MIN_HALF_WIDTH, ...pts.map((p) => Math.abs(p.x))) + PAD;
  const yLo = Math.min(-7, ...pts.map((p) => p.y)) - PAD;
  const yHi = Math.max(6, ...pts.map((p) => p.y)) + PAD;
  const w = xHalf * 2 * PX,
    h = (yHi - yLo) * PX;
  const sx = (x: number) => (x + xHalf) * PX;
  const sy = (y: number) => (yHi - y) * PX;
  const rows: number[] = [];
  for (let y = Math.ceil(yLo); y <= yHi; y += 1) rows.push(y);
  const r = PX * 0.74,
    olHalf = PX * 0.5;
  const maxDepth = Math.max(0, ...routes.flatMap((rt) => rt.map((p) => p.y)));
  const playType = side === 'defense' ? null : maxDepth >= 7 ? 'PASS' : 'RUN';
  let s = `<svg viewBox="0 0 ${w} ${h}" style="width:100%;height:auto;display:block;border-radius:8px">`;
  s += `<rect x="0" y="0" width="${w}" height="${h}" fill="var(--sunken)"/>`;
  for (const y of rows) {
    const five = y % 5 === 0,
      yy = sy(y);
    s += `<g stroke="var(--line)" stroke-width="1">`;
    s += `<line x1="0" x2="${five ? 11 : 6}" y1="${yy}" y2="${yy}"/><line x1="${w - (five ? 11 : 6)}" x2="${w}" y1="${yy}" y2="${yy}"/>`;
    s += `<line x1="${sx(-HASH_X) - 2.5}" x2="${sx(-HASH_X) + 2.5}" y1="${yy}" y2="${yy}" opacity="0.7"/><line x1="${sx(HASH_X) - 2.5}" x2="${sx(HASH_X) + 2.5}" y1="${yy}" y2="${yy}" opacity="0.7"/></g>`;
  }
  for (const y of rows.filter((v) => v > 0 && v % 5 === 0))
    s += `<text x="16" y="${sy(y) + 3}" font-size="8.5" text-anchor="middle" fill="var(--ink-3)" opacity="0.7">${y}</text>`;
  s += `<line x1="0" x2="${w}" y1="${sy(0)}" y2="${sy(0)}" stroke="var(--ink-2)" stroke-width="1.7"/>`;
  routes.forEach((p2, i) => {
    if (p2.length < 2) return;
    const stroke = posColor(align[i] ? label(align[i], side) : null);
    const d = p2.map((p, k) => `${k === 0 ? 'M' : 'L'} ${sx(p.x).toFixed(1)} ${sy(p.y).toFixed(1)}`).join(' ');
    const end = p2[p2.length - 1],
      prev = p2[p2.length - 2];
    const ang = Math.atan2(sy(end.y) - sy(prev.y), sx(end.x) - sx(prev.x)),
      ah = 7.5,
      a1 = ang + Math.PI - 0.42,
      a2 = ang + Math.PI + 0.42;
    s += `<path d="${d}" fill="none" stroke="${stroke}" stroke-width="2.3" stroke-linejoin="round" stroke-linecap="round"/>`;
    s += `<path d="M ${sx(end.x).toFixed(1)} ${sy(end.y).toFixed(1)} L ${(sx(end.x) + ah * Math.cos(a1)).toFixed(1)} ${(sy(end.y) + ah * Math.sin(a1)).toFixed(1)} M ${sx(end.x).toFixed(1)} ${sy(end.y).toFixed(1)} L ${(sx(end.x) + ah * Math.cos(a2)).toFixed(1)} ${(sy(end.y) + ah * Math.sin(a2)).toFixed(1)}" stroke="${stroke}" stroke-width="2.3" stroke-linecap="round" fill="none"/>`;
  });
  align.forEach((p) => {
    const cx = sx(p.x),
      cy = sy(p.y),
      l = label(p, side);
    if (side === 'offense' && p.posType === 4) {
      s += `<rect x="${cx - olHalf}" y="${cy - olHalf}" width="${olHalf * 2}" height="${olHalf * 2}" rx="2" fill="${POS.OL}" stroke="var(--surface)" stroke-width="1.3"/>`;
      s += `<line x1="${cx}" x2="${cx}" y1="${cy - olHalf}" y2="${cy - PX * 1.05}" stroke="${POS.OL}" stroke-width="1.6"/>`;
      return;
    }
    const fill = posColor(l);
    s += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" stroke="var(--surface)" stroke-width="1.6"/>`;
    if (l) s += `<text x="${cx}" y="${cy + 3.1}" font-size="8.5" font-weight="700" text-anchor="middle" fill="${ink(fill)}">${l}</text>`;
  });
  if (playType) {
    s += `<rect x="7" y="${h - 20}" width="${playType === 'PASS' ? 42 : 38}" height="14" rx="3" fill="${POS.WR}" opacity="0.92"/>`;
    s += `<text x="${playType === 'PASS' ? 28 : 26}" y="${h - 9.5}" font-size="9" font-weight="700" text-anchor="middle" fill="#fff">${playType}</text>`;
  }
  return s + '</svg>';
}

const readBook = (key: string) =>
  JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(booksDir, `${key}.json.gz`))).toString()) as {
    formations: PlaybookFormation[];
  };
const off = readBook('o_ohio_state');
const def = readBook('d_multiple');
function pick(book: { formations: PlaybookFormation[] }, form: string, play: string) {
  const f = book.formations.find((x) => x.name.toLowerCase().includes(form.toLowerCase()));
  const p = f?.plays.find((x) => x.name.toLowerCase().includes(play.toLowerCase()));
  return f && p ? { f, p } : null;
}
const picks: [string, { formations: PlaybookFormation[] }, string, string, 'offense' | 'defense'][] = [
  ['Ohio State', off, 'Split Close', 'Double Swirl', 'offense'],
  ['Ohio State', off, 'Trips TE', 'HB', 'offense'],
  ['Ohio State', off, 'Normal Y Off', '', 'offense'],
  ['Multiple', def, 'Over', 'Cover 2', 'defense']
];
const cards = picks
  .map(([book, data, form, play, side]) => {
    const hit = pick(data, form, play);
    if (!hit) return `<div class="card"><div class="lbl">${book}: ${form} ${play} (not found)</div></div>`;
    const pers = (() => {
      let wr = 0,
        te = 0,
        rb = 0;
      for (const p of hit.f.alignment) {
        const l = label(p, side);
        if (l === 'WR' || l === 'SL') wr++;
        else if (l === 'TE') te++;
        else if (l === 'HB') rb++;
      }
      return side === 'offense' ? `${wr}WR · ${te}TE · ${rb}RB` : '';
    })();
    return `<div class="card"><div class="lbl">${book} · ${hit.f.family} · ${hit.f.name} · ${pers}</div><div class="pn">${hit.p.name}</div>${svg(hit.f, hit.p, side)}</div>`;
  })
  .join('\n');
const html = `<!doctype html><html><head><meta charset="utf8"><style>
:root{--sunken:#0b0d0e;--surface:#16181b;--ink-2:#a8a49b;--ink-3:#8f8a80;--line:rgba(233,231,226,0.18)}
body{background:#101214;color:#e9e7e2;font-family:system-ui;margin:0;padding:20px}
.grid{display:grid;grid-template-columns:1fr;gap:18px;max-width:640px}
.card{background:#16181b;border:1px solid var(--line);border-radius:10px;padding:12px}
.lbl{font-size:11px;letter-spacing:.05em;text-transform:uppercase;color:var(--ink-2)}
.pn{font-size:19px;font-weight:700;margin:2px 0 8px}
h1{font-size:15px}
</style></head><body><h1>Play-art style — position icons, color routes, field, personnel</h1><div class="grid">${cards}</div></body></html>`;
fs.writeFileSync(out, html);
console.log('wrote', out);
