import type { PlaybookFormation, PlaybookPlay } from '../../../shared/types.ts';

/**
 * Self-rendered play art. Draws a field slice with the line of scrimmage, the formation's
 * player alignment, and each player's route/assignment polyline — from the coordinates
 * extracted out of the game's playbook assets (yards; LOS at y=0, +x = offense's right,
 * +y downfield). Team-color aware and light/dark safe via theme tokens.
 */

const PX = 11; // pixels per yard
const PAD = 2.4; // yard padding around fitted content
const DEPTH_CAP = 24; // clip routes this many yards past the LOS for readability
const MIN_HALF_WIDTH = 15; // always show at least this many yards either side of center

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

export default function PlayArt({
  formation,
  play,
  color
}: {
  formation: PlaybookFormation;
  play: PlaybookPlay;
  color: string;
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

  // 5-yard reference lines within the window.
  const yardLines: number[] = [];
  for (let y = Math.ceil(yLo / 5) * 5; y <= yHi; y += 5) yardLines.push(y);

  // Hash marks: college hashes sit ~30 ft (10 yd) off centre → ±10 yards.
  const hash = 10;

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      style={{ width: '100%', height: 'auto', display: 'block', borderRadius: 8 }}
      role="img"
      aria-label={`${formation.name} — ${play.name} play diagram`}
    >
      <rect x={0} y={0} width={w} height={h} fill="var(--sunken)" />

      {yardLines.map((y) => (
        <line
          key={`yl${y}`}
          x1={0}
          x2={w}
          y1={sy(y)}
          y2={sy(y)}
          stroke="var(--line-soft)"
          strokeWidth={y === 0 ? 0 : 1}
        />
      ))}

      {/* hash ticks along each yard line */}
      {yardLines.flatMap((y) =>
        [-hash, hash].map((hx) => (
          <line
            key={`h${y}_${hx}`}
            x1={sx(hx) - 3}
            x2={sx(hx) + 3}
            y1={sy(y)}
            y2={sy(y)}
            stroke="var(--line)"
            strokeWidth={1}
          />
        ))
      )}

      {/* line of scrimmage */}
      <line x1={0} x2={w} y1={sy(0)} y2={sy(0)} stroke="var(--ink-2)" strokeWidth={1.6} />

      {/* routes */}
      {routes.map((pts2, i) => {
        if (pts2.length < 2) return null;
        const d = pts2.map((p, k) => `${k === 0 ? 'M' : 'L'} ${sx(p.x).toFixed(1)} ${sy(p.y).toFixed(1)}`).join(' ');
        const end = pts2[pts2.length - 1];
        const prev = pts2[pts2.length - 2];
        const ang = Math.atan2(sy(end.y) - sy(prev.y), sx(end.x) - sx(prev.x));
        const ah = 7;
        const a1 = ang + Math.PI - 0.42;
        const a2 = ang + Math.PI + 0.42;
        return (
          <g key={`r${i}`}>
            <path d={d} fill="none" stroke={color} strokeWidth={2.1} strokeLinejoin="round" strokeLinecap="round" />
            <path
              d={`M ${sx(end.x).toFixed(1)} ${sy(end.y).toFixed(1)} L ${(sx(end.x) + ah * Math.cos(a1)).toFixed(1)} ${(sy(end.y) + ah * Math.sin(a1)).toFixed(1)} M ${sx(end.x).toFixed(1)} ${sy(end.y).toFixed(1)} L ${(sx(end.x) + ah * Math.cos(a2)).toFixed(1)} ${(sy(end.y) + ah * Math.sin(a2)).toFixed(1)}`}
              stroke={color}
              strokeWidth={2.1}
              strokeLinecap="round"
              fill="none"
            />
          </g>
        );
      })}

      {/* players */}
      {align.map((p, i) => {
        const hasRoute = (routes[i]?.length ?? 0) >= 2;
        const cx = sx(p.x);
        const cy = sy(p.y);
        return (
          <g key={`p${i}`}>
            <title>{`Player ${i + 1}`}</title>
            <circle
              cx={cx}
              cy={cy}
              r={PX * 0.62}
              fill={hasRoute ? color : 'var(--surface)'}
              stroke={hasRoute ? 'var(--surface)' : 'var(--ink-2)'}
              strokeWidth={1.4}
            />
            {!hasRoute && (
              // blocker/lineman tick just in front of the LOS
              <line
                x1={cx}
                x2={cx}
                y1={cy - PX * 0.62}
                y2={cy - PX * 1.1}
                stroke="var(--ink-2)"
                strokeWidth={1.6}
              />
            )}
          </g>
        );
      })}
    </svg>
  );
}
