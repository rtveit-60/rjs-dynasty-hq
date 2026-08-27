import type { PlaybookFormation, PlaybookPlay, PlaybookPlayer } from '../../../shared/types.ts';

/**
 * Self-rendered play art in a broadcast-telestrator style: a field slice with sideline yard
 * ticks, college hash marks and the line of scrimmage; players drawn as position-colored
 * icons (WR/TE/RB/QB, defensive DL/LB/DB, and an offensive-line row); and each player's route
 * as a color-matched polyline with an arrowhead. All geometry comes from the coordinates
 * extracted out of the game's playbook assets (yards; LOS at y=0, +x = offense's right,
 * +y downfield). Light/dark safe; the field uses theme tokens, the icons a fixed position
 * palette so the diagram reads the same on any team's page.
 */

const PX = 11; // pixels per yard
const PAD = 2.6; // yard padding around fitted content
const DEPTH_CAP = 24; // clip routes this many yards past the LOS for readability
const MIN_HALF_WIDTH = 16; // always show at least this many yards either side of center
const HASH_X = 6.67; // college hash marks sit 40 ft (13.3 yd) apart → ±6.67 yd off centre

// Position palette — broadcast convention (WR blue, TE amber, RB teal, QB magenta, line gray;
// defense: line red, backers amber, backs blue). Fixed hex so the art reads on any team color.
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

/** Clip a polyline so it never runs past ±DEPTH_CAP downfield, interpolating the crossing. */
function clipDepth(points: Pt[]): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    if (Math.abs(p.y) <= DEPTH_CAP) {
      out.push(p);
      continue;
    }
    const prev = points[i - 1];
    if (prev && Math.abs(prev.y) <= DEPTH_CAP) {
      const cap = p.y > 0 ? DEPTH_CAP : -DEPTH_CAP;
      const t = (cap - prev.y) / (p.y - prev.y);
      out.push({ x: prev.x + (p.x - prev.x) * t, y: cap });
    }
    break;
  }
  return out;
}

/**
 * Position label for a player. Offense: posType 1 = QB, 4 = O-line (drawn as a blocker); the
 * skill slots (15-19) are classified from where they align. Defense: by depth off the ball.
 */
export function positionLabel(p: PlaybookPlayer, side: 'offense' | 'defense'): string | null {
  if (side === 'defense') {
    if (p.y <= 2.8) return 'DL';
    if (p.y <= 7) return 'LB';
    return 'DB';
  }
  if (p.posType === 1) return 'QB';
  if (p.posType === 4) return null; // interior offensive line
  if (p.y <= -3.5) return 'HB'; // set back in the backfield
  if (Math.abs(p.x) >= 11) return 'WR'; // split wide
  if (Math.abs(p.x) <= 7) return 'TE'; // tight to the formation
  return 'SL'; // slot
}

/** Personnel grouping for a formation, e.g. "3WR · 1TE · 1RB" (offense) or "4DL · 3LB · 4DB". */
export function personnelLabel(formation: PlaybookFormation, side: 'offense' | 'defense'): string | null {
  if (side === 'defense') {
    let dl = 0;
    let lb = 0;
    let db = 0;
    for (const p of formation.alignment) {
      const l = positionLabel(p, 'defense');
      if (l === 'DL') dl++;
      else if (l === 'LB') lb++;
      else if (l === 'DB') db++;
    }
    return `${dl}DL · ${lb}LB · ${db}DB`;
  }
  let wr = 0;
  let te = 0;
  let rb = 0;
  for (const p of formation.alignment) {
    const l = positionLabel(p, 'offense');
    if (l === 'WR' || l === 'SL') wr++;
    else if (l === 'TE') te++;
    else if (l === 'HB') rb++;
  }
  return `${wr}WR · ${te}TE · ${rb}RB`;
}

/** Palette key for a label (HB shares the RB color). */
function posColor(label: string | null): string {
  if (!label) return POS.OL;
  return POS[label] ?? (label === 'HB' ? POS.RB : POS.WR);
}

/** Readable label ink for a given fill (dark text on light fills, white on dark). */
function inkFor(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.6 ? '#141210' : '#ffffff';
}

export default function PlayArt({
  formation,
  play,
  side
}: {
  formation: PlaybookFormation;
  play: PlaybookPlay;
  side: 'offense' | 'defense';
}) {
  const align = formation.alignment;
  const routes = play.routes.map((r) => clipDepth(r.points));

  // Fit the field window to alignment + routes.
  const pts: Pt[] = [...align];
  for (const r of routes) pts.push(...r);
  const maxAbsX = Math.max(MIN_HALF_WIDTH, ...pts.map((p) => Math.abs(p.x)));
  const xHalf = maxAbsX + PAD;
  const yLo = Math.min(-7, ...pts.map((p) => p.y)) - PAD;
  const yHi = Math.max(6, ...pts.map((p) => p.y)) + PAD;

  const w = xHalf * 2 * PX;
  const h = (yHi - yLo) * PX;
  const sx = (x: number) => (x + xHalf) * PX;
  const sy = (y: number) => (yHi - y) * PX; // +y (downfield) = up on screen

  // per-yard rows for sideline ticks + hash marks; 5-yard rows get depth numbers
  const yardRows: number[] = [];
  for (let y = Math.ceil(yLo); y <= yHi; y += 1) yardRows.push(y);

  const r = PX * 0.74; // skill/labeled player radius
  const olHalf = PX * 0.5; // offensive-line marker half-size

  // Play type, derived from how far the routes travel (screens/runs stay shallow).
  const maxDepth = Math.max(0, ...routes.flatMap((rt) => rt.map((p) => p.y)));
  const playType = side === 'defense' ? null : maxDepth >= 7 ? 'PASS' : 'RUN';

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      style={{ width: '100%', height: 'auto', display: 'block', borderRadius: 8 }}
      role="img"
      aria-label={`${formation.name} — ${play.name} play diagram`}
    >
      <rect x={0} y={0} width={w} height={h} fill="var(--sunken)" />

      {/* sideline yard ticks (both edges) + college hash marks (two centre rows) */}
      {yardRows.map((y) => {
        const five = y % 5 === 0;
        const yy = sy(y);
        return (
          <g key={`row${y}`} stroke="var(--line)" strokeWidth={1}>
            <line x1={0} x2={five ? 11 : 6} y1={yy} y2={yy} />
            <line x1={w - (five ? 11 : 6)} x2={w} y1={yy} y2={yy} />
            <line x1={sx(-HASH_X) - 2.5} x2={sx(-HASH_X) + 2.5} y1={yy} y2={yy} opacity={0.7} />
            <line x1={sx(HASH_X) - 2.5} x2={sx(HASH_X) + 2.5} y1={yy} y2={yy} opacity={0.7} />
          </g>
        );
      })}

      {/* yard-depth numbers off the LOS */}
      {yardRows
        .filter((y) => y > 0 && y % 5 === 0)
        .map((y) => (
          <text
            key={`yn${y}`}
            x={16}
            y={sy(y) + 3}
            fontSize={8.5}
            fontFamily="var(--font-display)"
            textAnchor="middle"
            fill="var(--ink-3)"
            opacity={0.7}
          >
            {y}
          </text>
        ))}

      {/* line of scrimmage */}
      <line x1={0} x2={w} y1={sy(0)} y2={sy(0)} stroke="var(--ink-2)" strokeWidth={1.7} />

      {/* routes, colored to match their player */}
      {routes.map((pts2, i) => {
        if (pts2.length < 2) return null;
        const stroke = posColor(align[i] ? positionLabel(align[i], side) : null);
        const d = pts2
          .map((p, k) => `${k === 0 ? 'M' : 'L'} ${sx(p.x).toFixed(1)} ${sy(p.y).toFixed(1)}`)
          .join(' ');
        const end = pts2[pts2.length - 1];
        const prev = pts2[pts2.length - 2];
        const ang = Math.atan2(sy(end.y) - sy(prev.y), sx(end.x) - sx(prev.x));
        const ah = 7.5;
        const a1 = ang + Math.PI - 0.42;
        const a2 = ang + Math.PI + 0.42;
        return (
          <g key={`r${i}`}>
            <path d={d} fill="none" stroke={stroke} strokeWidth={2.3} strokeLinejoin="round" strokeLinecap="round" />
            <path
              d={`M ${sx(end.x).toFixed(1)} ${sy(end.y).toFixed(1)} L ${(sx(end.x) + ah * Math.cos(a1)).toFixed(1)} ${(sy(end.y) + ah * Math.sin(a1)).toFixed(1)} M ${sx(end.x).toFixed(1)} ${sy(end.y).toFixed(1)} L ${(sx(end.x) + ah * Math.cos(a2)).toFixed(1)} ${(sy(end.y) + ah * Math.sin(a2)).toFixed(1)}`}
              stroke={stroke}
              strokeWidth={2.3}
              strokeLinecap="round"
              fill="none"
            />
          </g>
        );
      })}

      {/* players */}
      {align.map((p, i) => {
        const cx = sx(p.x);
        const cy = sy(p.y);
        const label = positionLabel(p, side);
        const isLine = side === 'offense' && p.posType === 4;

        if (isLine) {
          return (
            <g key={`p${i}`}>
              <title>Offensive line</title>
              <rect
                x={cx - olHalf}
                y={cy - olHalf}
                width={olHalf * 2}
                height={olHalf * 2}
                rx={2}
                fill={POS.OL}
                stroke="var(--surface)"
                strokeWidth={1.3}
              />
              <line x1={cx} x2={cx} y1={cy - olHalf} y2={cy - PX * 1.05} stroke={POS.OL} strokeWidth={1.6} />
            </g>
          );
        }

        const fill = posColor(label);
        return (
          <g key={`p${i}`}>
            <title>{label ?? `Player ${i + 1}`}</title>
            <circle cx={cx} cy={cy} r={r} fill={fill} stroke="var(--surface)" strokeWidth={1.6} />
            {label && (
              <text
                x={cx}
                y={cy + 3.1}
                fontSize={8.5}
                fontWeight={700}
                fontFamily="var(--font-display)"
                textAnchor="middle"
                fill={inkFor(fill)}
                style={{ letterSpacing: '0.02em' }}
              >
                {label}
              </text>
            )}
          </g>
        );
      })}

      {/* play-type flag */}
      {playType && (
        <g>
          <rect x={7} y={h - 20} width={playType === 'PASS' ? 42 : 38} height={14} rx={3} fill={POS.WR} opacity={0.92} />
          <text
            x={playType === 'PASS' ? 28 : 26}
            y={h - 9.5}
            fontSize={9}
            fontWeight={700}
            fontFamily="var(--font-display)"
            textAnchor="middle"
            fill="#fff"
            style={{ letterSpacing: '0.06em' }}
          >
            {playType}
          </text>
        </g>
      )}
    </svg>
  );
}
