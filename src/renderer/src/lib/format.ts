import { ARCHETYPE_LABELS } from '../../../shared/archetypes.ts';

export function schemeLabel(raw: string): string {
  if (!raw) return '—';
  const parts = raw.replace(/^(OFF|DEF)_/, '').split('_');
  const out: string[] = [];
  for (const part of parts) {
    if (/^\d+$/.test(part) && out.length && /\d$/.test(out[out.length - 1])) {
      out[out.length - 1] += `-${part}`;
    } else if (/^\d/.test(part)) {
      // e.g. BASE4 → Base 4 handled below; plain digit token starts a numeric run
      out.push(part);
    } else {
      const m = part.match(/^([A-Z]+?)(\d.*)$/);
      if (m) {
        out.push(titleWord(m[1]));
        out.push(m[2]);
      } else {
        out.push(titleWord(part));
      }
    }
  }
  return out.join(' ').replace(/(\d) (\d)/g, '$1-$2');
}

function titleWord(w: string): string {
  return w.charAt(0) + w.slice(1).toLowerCase();
}

/** "NorthCarolina" → "North Carolina" */
export function spaceOut(raw: string): string {
  return raw.replace(/([a-z])([A-Z])/g, '$1 $2');
}

export function heightFt(inches: number): string {
  if (!inches) return '—';
  return `${Math.floor(inches / 12)}'${inches % 12}"`;
}

export function yearAbbrev(schoolYear: string, redshirt: string): string {
  const map: Record<string, string> = { Freshman: 'FR', Sophomore: 'SO', Junior: 'JR', Senior: 'SR' };
  const yr = map[schoolYear] ?? schoolYear;
  const rs = redshirt === 'Previous' || redshirt === 'Taken' || redshirt === 'Used' ? ' (RS)' : '';
  return yr + rs;
}

/**
 * The game's own archetype name where we know it, otherwise the enum made
 * readable: "WR_ShiftyRouteRunner" → "Shifty Route Runner".
 */
export function archetypeLabel(raw: string): string {
  if (!raw) return '—';
  return ARCHETYPE_LABELS[raw] ?? spaceOut(raw.replace(/^[A-Z]+_/, ''));
}

export function devLabel(raw: string): string {
  const t = raw.replace(/^College_/, '');
  return t === 'Normal' ? 'Normal' : t;
}

export function devClass(raw: string): string {
  const t = devLabel(raw).toLowerCase();
  if (t === 'impact') return 'dev impact';
  if (t === 'star') return 'dev star';
  if (t === 'elite') return 'dev elite';
  return 'dev';
}

export function ovrTier(v: number): string {
  if (v >= 90) return 'ovr t1';
  if (v >= 85) return 'ovr t2';
  if (v >= 78) return 'ovr t3';
  if (v >= 70) return 'ovr t4';
  return 'ovr t5';
}

export function prestigeLabel(raw: string | null): string {
  if (!raw) return '—';
  return raw.replace('plus', '+').replace('minus', '−');
}

export function pct(part: number, whole: number): number {
  return whole > 0 ? Math.round((part / whole) * 100) : 0;
}

export function stars(n: number): string {
  return '★'.repeat(Math.max(0, n)) + '☆'.repeat(Math.max(0, 5 - n));
}

export const STAGE_LABELS: Record<string, string> = {
  Top10: 'Top 10',
  Top5: 'Top 5',
  Top3: 'Top 3',
  Battle: 'Battle',
  SoftCommitted: 'Soft Commit',
  HardCommitted: 'Hard Commit'
};

export function fmt(n: number): string {
  return n.toLocaleString('en-US');
}

export function relTime(ts: number | null): string {
  if (!ts) return '';
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 10) return 'just now';
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return new Date(ts).toLocaleDateString();
}

export function initials(name: string): string {
  const words = name.split(/\s+/).filter(Boolean);
  return words.slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '—';
}

/** Perceived luminance → readable text color on a team color. */
export function contrastOn(hex: string): string {
  const m = hex.match(/^#([0-9a-f]{6})$/i);
  if (!m) return '#ffffff';
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return lum > 150 ? '#16181b' : '#ffffff';
}

export const POSITION_GROUPS: Record<string, string[]> = {
  QB: ['QB'],
  RB: ['HB', 'FB'],
  WR: ['WR'],
  TE: ['TE'],
  OL: ['LT', 'LG', 'C', 'RG', 'RT'],
  DL: ['LE', 'RE', 'DT', 'NT'],
  LB: ['LOLB', 'MLB', 'ROLB'],
  DB: ['CB', 'FS', 'SS'],
  ST: ['K', 'P', 'LS']
};

/**
 * How the game shows a recruit's position on a board row: the defensive front
 * collapses into role names (LE/RE → EDGE, MLB → MIKE, LOLB/ROLB → OLB) while
 * offensive linemen keep their side (LT, RG…). NT never appears in a class or
 * the portal, but maps to DT in case a save surprises us.
 */
const RECRUIT_POS: Record<string, string> = {
  LE: 'EDGE', RE: 'EDGE', MLB: 'MIKE', LOLB: 'OLB', ROLB: 'OLB', NT: 'DT'
};

export function recruitPos(savePos: string): string {
  return RECRUIT_POS[savePos] ?? savePos;
}

/**
 * The main position types the game files recruits under, in the needs-strip
 * order — one PositionRank pool each, verified from the save itself: rank runs
 * as a single contiguous pool across LT+RT, LG+RG, LE+RE and LOLB+ROLB (one
 * #1 each), while MLB, FS, SS, K and P rank alone.
 */
export const RECRUIT_POS_OPTIONS: { key: string; positions: string[] }[] = [
  { key: 'QB', positions: ['QB'] },
  { key: 'HB', positions: ['HB'] },
  { key: 'FB', positions: ['FB'] },
  { key: 'WR', positions: ['WR'] },
  { key: 'TE', positions: ['TE'] },
  { key: 'OT', positions: ['LT', 'RT'] },
  { key: 'OG', positions: ['LG', 'RG'] },
  { key: 'C', positions: ['C'] },
  { key: 'EDGE', positions: ['LE', 'RE'] },
  { key: 'DT', positions: ['DT', 'NT'] },
  { key: 'OLB', positions: ['LOLB', 'ROLB'] },
  { key: 'MIKE', positions: ['MLB'] },
  { key: 'CB', positions: ['CB'] },
  { key: 'FS', positions: ['FS'] },
  { key: 'SS', positions: ['SS'] },
  { key: 'K', positions: ['K'] },
  { key: 'P', positions: ['P'] }
];

/** Save positions a dropdown selection covers; empty = no position filter. */
export function recruitPositionsFor(key: string): string[] {
  return RECRUIT_POS_OPTIONS.find((o) => o.key === key)?.positions ?? [];
}

const POOL_OF: Record<string, string> = {};
for (const o of RECRUIT_POS_OPTIONS) for (const p of o.positions) POOL_OF[p] = o.key;

/** The main type a save position files under: "RT" → "OT", "MLB" → "MIKE". */
export function recruitPosPool(savePos: string): string {
  return POOL_OF[savePos] ?? savePos;
}

/** "WR_ShiftyRouteRunner" → "Shifty Route Runner"; also the role prefix. */
export function archetypeRole(raw: string): string {
  return raw.includes('_') ? raw.split('_')[0] : '';
}

export const DEPTH_SECTIONS: { title: string; positions: string[] }[] = [
  { title: 'Offense', positions: ['QB', 'HB', 'FB', 'WR', 'TE', 'LT', 'LG', 'C', 'RG', 'RT'] },
  { title: 'Defense', positions: ['LE', 'DT', 'NT', 'RE', 'LOLB', 'MLB', 'ROLB', 'CB', 'FS', 'SS'] },
  { title: 'Special Teams', positions: ['K', 'KOS', 'P', 'LS', 'KR', 'PR'] },
  { title: 'Situational', positions: ['3DRB', 'PWHB', 'SLCB', 'RLE', 'RRE', 'RDT', 'GAD'] }
];

export const DEPTH_LABELS: Record<string, string> = {
  '3DRB': '3rd Down Back',
  PWHB: 'Power Back',
  SLCB: 'Slot Corner',
  RLE: 'Rush Left End',
  RRE: 'Rush Right End',
  RDT: 'Rush DT',
  KOS: 'Kickoff',
  KR: 'Kick Return',
  PR: 'Punt Return',
  GAD: 'Gadget',
  LS: 'Long Snapper',
  NT: 'Nose Tackle'
};
