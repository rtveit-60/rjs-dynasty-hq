import type { PlaybookFormation, PlaybookPlay, PlaybookPlayer } from '../../../shared/types.ts';

/**
 * Self-rendered play art in the broadcast/telestrator style of the reference sites, on our own
 * game-extracted data. A field slice with distinct yard lines, sideline ticks, college hash
 * marks and the line of scrimmage; offensive skill players drawn as their controller passing
 * icon (A/B/X/Y face buttons, RB/LB bumpers) with a color-matched route + arrowhead; the QB
 * and offensive line marked; and on defense, position icons (DL/LB/DB) with rush arrows for
 * rushers and translucent coverage-zone bubbles where defenders drop. Assumes Xbox controls.
 *
 * Geometry is in yards (LOS at y=0, +x = offense's right, +y downfield). Light/dark safe: the
 * field uses theme tokens, the icons a fixed controller/position palette.
 */

const PX = 11; // pixels per yard
const PAD = 2.6; // yard padding around fitted content
const DEPTH_CAP = 24; // clip routes this many yards past the LOS for readability
const MIN_HALF_WIDTH = 16; // always show at least this many yards either side of center
const HASH_X = 6.67; // college hash marks sit 40 ft (13.3 yd) apart → ±6.67 yd off centre

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
const QB_COLOR = '#e24a84';
const OL_COLOR = '#8b9099';
// Defense: line red, backers amber, backs blue (level-coded).
const DEF_COLOR: Record<string, string> = { DL: '#e2555a', LB: '#f0a028', DB: '#3b82f6' };

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

  const yardRows: number[] = [];
  for (let y = Math.ceil(yLo); y <= yHi; y += 1) yardRows.push(y);

  const rr = PX * 0.76; // player icon radius
  const olHalf = PX * 0.5;

  const routeColor = (i: number): string => {
    if (side === 'defense') return DEF_COLOR[defenseLabel(align[i])] ?? DEF_COLOR.DB;
    if (buttons[i]) return BTN_COLOR[buttons[i]!] ?? OL_COLOR;
    return align[i]?.posType === 1 ? QB_COLOR : OL_COLOR;
  };

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

      {/* distinct 5-yard lines across the field */}
      {yardRows
        .filter((y) => y % 5 === 0 && y !== 0)
        .map((y) => (
          <line key={`yl${y}`} x1={0} x2={w} y1={sy(y)} y2={sy(y)} stroke="var(--line)" strokeWidth={1.1} />
        ))}

      {/* sideline yard ticks + college hash marks (per yard) */}
      {yardRows.map((y) => {
        const five = y % 5 === 0;
        const yy = sy(y);
        return (
          <g key={`row${y}`} stroke="var(--line)" strokeWidth={1}>
            <line x1={0} x2={five ? 13 : 7} y1={yy} y2={yy} />
            <line x1={w - (five ? 13 : 7)} x2={w} y1={yy} y2={yy} />
            <line x1={sx(-HASH_X) - 3} x2={sx(-HASH_X) + 3} y1={yy} y2={yy} opacity={0.6} />
            <line x1={sx(HASH_X) - 3} x2={sx(HASH_X) + 3} y1={yy} y2={yy} opacity={0.6} />
          </g>
        );
      })}

      {/* yard-depth numbers off the LOS */}
      {yardRows
        .filter((y) => y > 0 && y % 5 === 0)
        .map((y) => (
          <text
            key={`yn${y}`}
            x={17}
            y={sy(y) + 3}
            fontSize={8.5}
            fontFamily="var(--font-display)"
            textAnchor="middle"
            fill="var(--ink-3)"
            opacity={0.75}
          >
            {y}
          </text>
        ))}

      {/* coverage-zone bubbles: where non-rushing defenders drop */}
      {side === 'defense' &&
        align.map((p, i) => {
          const lbl = defenseLabel(p);
          if (lbl === 'DL') return null;
          const end = routes[i]?.[routes[i].length - 1] ?? p;
          if (end.y < 1) return null; // rushed across the ball → not a zone
          return (
            <circle
              key={`z${i}`}
              cx={sx(end.x)}
              cy={sy(end.y)}
              r={PX * 3.4}
              fill={DEF_COLOR[lbl]}
              opacity={0.1}
              stroke={DEF_COLOR[lbl]}
              strokeOpacity={0.4}
              strokeWidth={1}
              strokeDasharray="3 3"
            />
          );
        })}

      {/* line of scrimmage */}
      <line x1={0} x2={w} y1={sy(0)} y2={sy(0)} stroke="var(--ink-2)" strokeWidth={1.8} />

      {/* routes, colored to match their player's icon */}
      {routes.map((pts2, i) => {
        if (pts2.length < 2) return null;
        const stroke = routeColor(i);
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

        // offensive line — blockers
        if (side === 'offense' && p.posType === 4) {
          return (
            <g key={`p${i}`}>
              <title>Offensive line</title>
              <rect
                x={cx - olHalf}
                y={cy - olHalf}
                width={olHalf * 2}
                height={olHalf * 2}
                rx={2}
                fill={OL_COLOR}
                stroke="var(--surface)"
                strokeWidth={1.3}
              />
              <line x1={cx} x2={cx} y1={cy - olHalf} y2={cy - PX * 1.05} stroke={OL_COLOR} strokeWidth={1.6} />
            </g>
          );
        }

        // offensive receiver with a controller passing icon
        const btn = side === 'offense' ? buttons[i] : null;
        if (btn) {
          const fill = BTN_COLOR[btn] ?? OL_COLOR;
          const bumper = btn.length > 1;
          if (bumper) {
            const bw = PX * 1.9;
            const bh = PX * 1.2;
            return (
              <g key={`p${i}`}>
                <title>{btn}</title>
                <rect x={cx - bw / 2} y={cy - bh / 2} width={bw} height={bh} rx={bh / 2} fill={fill} stroke="var(--surface)" strokeWidth={1.5} />
                <text x={cx} y={cy + 3} fontSize={8.5} fontWeight={700} fontFamily="var(--font-display)" textAnchor="middle" fill="#fff">
                  {btn}
                </text>
              </g>
            );
          }
          return (
            <g key={`p${i}`}>
              <title>{btn}</title>
              <circle cx={cx} cy={cy} r={rr} fill={fill} stroke="var(--surface)" strokeWidth={1.7} />
              <text x={cx} y={cy + 3.4} fontSize={10} fontWeight={700} fontFamily="var(--font-display)" textAnchor="middle" fill={inkFor(fill)}>
                {btn}
              </text>
            </g>
          );
        }

        // quarterback
        if (side === 'offense' && p.posType === 1) {
          return (
            <g key={`p${i}`}>
              <title>Quarterback</title>
              <circle cx={cx} cy={cy} r={rr} fill={QB_COLOR} stroke="var(--surface)" strokeWidth={1.7} />
              <text x={cx} y={cy + 3.2} fontSize={8.5} fontWeight={700} fontFamily="var(--font-display)" textAnchor="middle" fill="#fff">
                QB
              </text>
            </g>
          );
        }

        // defender
        if (side === 'defense') {
          const lbl = defenseLabel(p);
          const fill = DEF_COLOR[lbl];
          return (
            <g key={`p${i}`}>
              <title>{lbl}</title>
              <circle cx={cx} cy={cy} r={rr} fill={fill} stroke="var(--surface)" strokeWidth={1.6} />
              <text x={cx} y={cy + 3.2} fontSize={8.5} fontWeight={700} fontFamily="var(--font-display)" textAnchor="middle" fill={inkFor(fill)}>
                {lbl}
              </text>
            </g>
          );
        }

        // fallback (offensive skill player without an icon)
        return (
          <g key={`p${i}`}>
            <circle cx={cx} cy={cy} r={rr} fill={OL_COLOR} stroke="var(--surface)" strokeWidth={1.6} />
          </g>
        );
      })}

      {/* play-type flag */}
      {playType && (
        <g>
          <rect x={7} y={h - 20} width={playType === 'PASS' ? 42 : 38} height={14} rx={3} fill={BTN_COLOR.X} opacity={0.92} />
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
