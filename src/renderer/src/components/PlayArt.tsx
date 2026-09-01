import type { PlaybookFormation, PlaybookPlay, PlaybookPlayer } from '../../../shared/types.ts';

/**
 * Per-play diagrams drawn in the game's own playcall art language, from the
 * book's own geometry. The palette and marks are sampled from the extracted
 * concept diagrams (`pcc_*`): routes in the game's yellow, carrier and rush
 * paths in its red, blocking as white T-bars, zone drops as its blue
 * (deep) / teal (underneath) wells — combined with the app's controller
 * passing icons on the eligible receivers. The card is a dark well like the
 * game's playcall screen in both themes.
 *
 * Geometry is in yards (LOS at y=0, +x = offense's right, +y downfield).
 */

const PX = 11; // pixels per yard
const PAD = 2.6; // yard padding around fitted content
const DEPTH_CAP = 24; // clip routes this many yards past the LOS for readability
const MIN_HALF_WIDTH = 16; // always show at least this many yards either side of center

// The game's playcall art palette (sampled from the extracted concept art).
const WELL = '#191d26';
const ROUTE_YELLOW = '#f0e060';
const CARRY_RED = '#c01020';
const DEEP_BLUE = '#4070b0';
const UNDER_TEAL = '#60c0a0';
const CHALK = '#f0f0f0';

// Xbox controller colors for the passing icons; bumpers/triggers are gray pills.
const BTN_COLOR: Record<string, string> = {
  A: '#3f9b46',
  B: '#cf4b3f',
  X: '#3f7fe0',
  Y: '#e0b021',
  RB: '#71767f',
  LB: '#71767f',
  RT: '#71767f',
  LT: '#71767f'
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

/** Defensive position by depth off the ball. */
export function defenseLabel(p: PlaybookPlayer): string {
  if (p.y <= 2.8) return 'DL';
  if (p.y <= 7) return 'LB';
  return 'DB';
}

/** Personnel grouping for a formation, e.g. "3WR · 1TE · 1RB" (offense) or "4DL · 3LB · 4DB". */
export function personnelLabel(formation: PlaybookFormation, side: 'offense' | 'defense'): string | null {
  if (side === 'defense') {
    let dl = 0;
    let lb = 0;
    let db = 0;
    for (const p of formation.alignment) {
      const l = defenseLabel(p);
      if (l === 'DL') dl++;
      else if (l === 'LB') lb++;
      else db++;
    }
    return `${dl}DL · ${lb}LB · ${db}DB`;
  }
  // offense: QB (posType 1) and line (posType 4) excluded; backs are those set behind the ball.
  let wr = 0;
  let te = 0;
  let rb = 0;
  for (const p of formation.alignment) {
    if (p.posType === 1 || p.posType === 4) continue;
    if (p.y <= -3.5) rb++;
    else if (Math.abs(p.x) <= 7) te++;
    else wr++;
  }
  return `${wr}WR · ${te}TE · ${rb}RB`;
}

/** Readable label ink for a given fill (dark text on light fills, white on dark). */
function inkFor(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const lum = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return lum > 0.62 ? '#141210' : '#ffffff';
}

/** A solid game-style triangle arrowhead at the end of a path. */
function ArrowHead({ end, prev, color, size = 9 }: { end: Pt; prev: Pt; color: string; size?: number }) {
  const ang = Math.atan2(end.y - prev.y, end.x - prev.x);
  const a1 = ang + Math.PI - 0.5;
  const a2 = ang + Math.PI + 0.5;
  const tip = end;
  const b1 = { x: end.x + size * Math.cos(a1), y: end.y + size * Math.sin(a1) };
  const b2 = { x: end.x + size * Math.cos(a2), y: end.y + size * Math.sin(a2) };
  return <path d={`M ${tip.x} ${tip.y} L ${b1.x} ${b1.y} L ${b2.x} ${b2.y} Z`} fill={color} />;
}

/** A blocking T-bar: a short perpendicular cap at the end of a block path. */
function BlockCap({ end, prev, color, half = 6 }: { end: Pt; prev: Pt; color: string; half?: number }) {
  const ang = Math.atan2(end.y - prev.y, end.x - prev.x) + Math.PI / 2;
  const b1 = { x: end.x + half * Math.cos(ang), y: end.y + half * Math.sin(ang) };
  const b2 = { x: end.x - half * Math.cos(ang), y: end.y - half * Math.sin(ang) };
  return (
    <line x1={b1.x} y1={b1.y} x2={b2.x} y2={b2.y} stroke={color} strokeWidth={3} strokeLinecap="round" />
  );
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
  const buttons = play.buttons ?? [];

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
  const S = (p: Pt): Pt => ({ x: sx(p.x), y: sy(p.y) });

  // Route color, all from geometry: offensive assignments draw in the
  // game's route yellow; a defender whose assignment crosses the ball is a
  // rusher and draws in its red.
  const routeColor = (i: number): string => {
    if (side === 'defense') {
      const endPt = routes[i]?.[routes[i].length - 1];
      return endPt && endPt.y < 1 ? CARRY_RED : ROUTE_YELLOW;
    }
    return ROUTE_YELLOW;
  };

  const rr = PX * 0.72; // player icon radius
  const olR = PX * 0.5;

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      style={{ width: '100%', height: 'auto', display: 'block', borderRadius: 8 }}
      role="img"
      aria-label={`${formation.name} — ${play.name} play diagram`}
    >
      <rect x={0} y={0} width={w} height={h} fill={WELL} />

      {/* faint 5-yard rails, game-minimal */}
      {Array.from({ length: Math.floor((yHi - Math.ceil(yLo)) / 5) + 1 }, (_, k) => {
        const y = Math.ceil(yLo / 5) * 5 + k * 5;
        if (y < yLo || y > yHi || y === 0) return null;
        return (
          <line key={`yl${y}`} x1={0} x2={w} y1={sy(y)} y2={sy(y)} stroke={CHALK} strokeWidth={1} opacity={0.07} />
        );
      })}

      {/* coverage-zone wells: deep drops in the game's blue, underneath in its teal */}
      {side === 'defense' &&
        align.map((p, i) => {
          const lbl = defenseLabel(p);
          if (lbl === 'DL') return null;
          const end = routes[i]?.[routes[i].length - 1] ?? p;
          if (end.y < 1) return null; // rushed across the ball → not a zone
          const deep = end.y >= 12;
          const color = deep ? DEEP_BLUE : UNDER_TEAL;
          return (
            <ellipse
              key={`z${i}`}
              cx={sx(end.x)}
              cy={sy(end.y)}
              rx={PX * 4.1}
              ry={PX * 2.7}
              fill={color}
              opacity={0.3}
              stroke={color}
              strokeOpacity={0.85}
              strokeWidth={1.6}
            />
          );
        })}

      {/* line of scrimmage */}
      <line x1={0} x2={w} y1={sy(0)} y2={sy(0)} stroke={CHALK} strokeWidth={1.8} opacity={0.55} />

      {/* offensive-line assignments: white block paths capped with T-bars */}
      {side === 'offense' &&
        align.map((p, i) => {
          if (p.posType !== 4) return null;
          const rt = routes[i];
          const from = S(p);
          if (rt && rt.length >= 2) {
            const d = rt.map((q, k) => `${k === 0 ? 'M' : 'L'} ${sx(q.x).toFixed(1)} ${sy(q.y).toFixed(1)}`).join(' ');
            const end = S(rt[rt.length - 1]);
            const prev = S(rt[rt.length - 2]);
            return (
              <g key={`ol${i}`}>
                <path d={d} fill="none" stroke={CHALK} strokeWidth={2.6} strokeLinejoin="round" strokeLinecap="round" opacity={0.9} />
                <BlockCap end={end} prev={prev} color={CHALK} />
              </g>
            );
          }
          const stub = { x: from.x, y: from.y - PX * 1.15 };
          return (
            <g key={`ol${i}`} opacity={0.9}>
              <line x1={from.x} y1={from.y} x2={stub.x} y2={stub.y} stroke={CHALK} strokeWidth={2.6} strokeLinecap="round" />
              <BlockCap end={stub} prev={from} color={CHALK} />
            </g>
          );
        })}

      {/* routes in the game's yellow; carriers and rushers in its red */}
      {routes.map((pts2, i) => {
        if (pts2.length < 2) return null;
        if (side === 'offense' && align[i]?.posType === 4) return null; // drawn as blocks above
        const stroke = routeColor(i);
        const d = pts2
          .map((p, k) => `${k === 0 ? 'M' : 'L'} ${sx(p.x).toFixed(1)} ${sy(p.y).toFixed(1)}`)
          .join(' ');
        
        return (
          <g key={`r${i}`}>
            <path
              d={d}
              fill="none"
              stroke={stroke}
              strokeWidth={3}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            <ArrowHead end={S(pts2[pts2.length - 1])} prev={S(pts2[pts2.length - 2])} color={stroke} size={9} />
          </g>
        );
      })}

      {/* players */}
      {align.map((p, i) => {
        const cx = sx(p.x);
        const cy = sy(p.y);

        // offensive line — white knots under their block bars
        if (side === 'offense' && p.posType === 4) {
          return <circle key={`p${i}`} cx={cx} cy={cy} r={olR} fill={CHALK} stroke={WELL} strokeWidth={1.4} />;
        }

        // offensive receiver with a controller passing icon
        const btn = side === 'offense' ? buttons[i] : null;
        if (btn) {
          const fill = BTN_COLOR[btn] ?? CHALK;
          const bumper = btn.length > 1;
          if (bumper) {
            const bw = PX * 1.9;
            const bh = PX * 1.2;
            return (
              <g key={`p${i}`}>
                <title>{btn}</title>
                <rect x={cx - bw / 2} y={cy - bh / 2} width={bw} height={bh} rx={bh / 2} fill={fill} stroke={WELL} strokeWidth={1.5} />
                <text x={cx} y={cy + 3} fontSize={8.5} fontWeight={700} fontFamily="var(--font-display)" textAnchor="middle" fill="#fff">
                  {btn}
                </text>
              </g>
            );
          }
          return (
            <g key={`p${i}`}>
              <title>{btn}</title>
              <circle cx={cx} cy={cy} r={rr} fill={fill} stroke={WELL} strokeWidth={1.7} />
              <text x={cx} y={cy + 3.4} fontSize={10} fontWeight={700} fontFamily="var(--font-display)" textAnchor="middle" fill={inkFor(fill)}>
                {btn}
              </text>
            </g>
          );
        }

        // quarterback — white knot like the game's, marked
        if (side === 'offense' && p.posType === 1) {
          return (
            <g key={`p${i}`}>
              <title>Quarterback</title>
              <circle cx={cx} cy={cy} r={rr} fill={CHALK} stroke={WELL} strokeWidth={1.6} />
              <text x={cx} y={cy + 3.2} fontSize={8} fontWeight={700} fontFamily="var(--font-display)" textAnchor="middle" fill="#20242e">
                QB
              </text>
            </g>
          );
        }

        // defender — white knot with a level label
        if (side === 'defense') {
          const lbl = defenseLabel(p);
          return (
            <g key={`p${i}`}>
              <title>{lbl}</title>
              <circle cx={cx} cy={cy} r={rr} fill={CHALK} stroke={WELL} strokeWidth={1.5} />
              <text x={cx} y={cy + 3.2} fontSize={8} fontWeight={700} fontFamily="var(--font-display)" textAnchor="middle" fill="#20242e">
                {lbl}
              </text>
            </g>
          );
        }

        // remaining offensive skill player (uniconed back/TE)
        return <circle key={`p${i}`} cx={cx} cy={cy} r={rr * 0.9} fill={CHALK} stroke={WELL} strokeWidth={1.5} />;
      })}

    </svg>
  );
}
