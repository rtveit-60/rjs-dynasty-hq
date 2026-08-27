import { BOWL_ART, bowlArtKey, readable, type BowlShape } from '../lib/bowl-art.ts';
import { CFP_BALL, CFP_GOLD_STOPS, CFP_LACES, CFP_LETTERS, isPlayoffRound } from '../lib/cfp-mark.ts';

/** Render one 24x24 shape primitive in the bowl's primary/secondary colors. */
export function bowlShapeNode(s: BowlShape, i: number, primary: string, secondary: string) {
  const color = s.alt ? secondary : primary;
  switch (s.t) {
    case 'c':
      return <circle key={i} cx={s.x} cy={s.y} r={s.r} fill={color} />;
    case 'e':
      return (
        <ellipse
          key={i}
          cx={s.x}
          cy={s.y}
          rx={s.rx}
          ry={s.ry}
          fill={color}
          transform={s.rot ? `rotate(${s.rot} ${s.x} ${s.y})` : undefined}
        />
      );
    case 'r':
      return <rect key={i} x={s.x} y={s.y} width={s.w} height={s.h} rx={s.rx ?? 0} fill={color} />;
    case 'p':
      return <path key={i} d={s.d} fill={color} fillRule="evenodd" />;
    case 'l':
      return (
        <path
          key={i}
          d={s.d}
          fill="none"
          stroke={color}
          strokeWidth={s.w ?? 1.4}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      );
  }
}

/**
 * The same mark as an SVG `<g>`, for placing inside an existing chart. `bottom`
 * is the baseline the mark should sit on; it is centered on `cx`.
 */
export function BowlMarkGroup({
  assetName,
  name,
  primary,
  secondary,
  cx,
  bottom,
  size
}: {
  assetName: string;
  name: string;
  primary: string;
  secondary: string;
  cx: number;
  bottom: number;
  size: number;
}) {
  if (isPlayoffRound(name)) return <CfpMarkGroup cx={cx} bottom={bottom} h={size * 0.78} />;
  const key = bowlArtKey(assetName, name);
  const shapes = key ? BOWL_ART[key] : null;
  if (!shapes?.length) return null;
  const k = size / 24;
  const p = readable(primary);
  const s2 = readable(secondary);
  return (
    <g transform={`translate(${cx - size / 2} ${bottom - size}) scale(${k})`}>
      {shapes.map((s, i) => bowlShapeNode(s, i, p, s2))}
    </g>
  );
}

/** The CFP mark as a `<g>`, sized to sit on `bottom` and centered on `cx`. */
export function CfpMarkGroup({ cx, bottom, h }: { cx: number; bottom: number; h: number }) {
  const k = h / 54;
  const w = 120 * k;
  const gid = 'cfp-gold-chart';
  return (
    <g transform={`translate(${cx - w / 2} ${bottom - h}) scale(${k})`}>
      <defs>
        <linearGradient id={gid} x1="121.155" y1="41.9629" x2="73.6889" y2="8.73581" gradientUnits="userSpaceOnUse">
          {CFP_GOLD_STOPS.map(([offset, color]) => (
            <stop key={offset} offset={offset} stopColor={color} />
          ))}
        </linearGradient>
      </defs>
      {CFP_LETTERS.map((d) => (
        <path key={d.slice(0, 12)} d={d} fill="var(--ink)" />
      ))}
      <path d={CFP_BALL} fill={`url(#${gid})`} />
      <path d={CFP_LACES} fill="#fff" />
    </g>
  );
}

/**
 * An original mark evoking the bowl's namesake, painted in the bowl's own brand
 * colors from the save. Falls back to a football when the bowl has no mark.
 */
export default function BowlIcon({
  assetName,
  name,
  primary,
  secondary,
  size = 16,
  title
}: {
  assetName: string;
  name: string;
  primary: string;
  secondary: string;
  size?: number;
  title?: string;
}) {
  // The playoff bracket rows are not bowls of their own — they wear the CFP mark.
  if (isPlayoffRound(name)) {
    const gid = 'cfp-gold-icon';
    return (
      <svg
        width={size * 2.2}
        height={size}
        viewBox="0 0 120 54"
        role="img"
        aria-label={title ?? name}
        style={{ display: 'inline-block', verticalAlign: 'middle', flex: 'none' }}
      >
        {title && <title>{title}</title>}
        <defs>
          <linearGradient id={gid} x1="121.155" y1="41.9629" x2="73.6889" y2="8.73581" gradientUnits="userSpaceOnUse">
            {CFP_GOLD_STOPS.map(([offset, color]) => (
              <stop key={offset} offset={offset} stopColor={color} />
            ))}
          </linearGradient>
        </defs>
        {CFP_LETTERS.map((d) => (
          <path key={d.slice(0, 12)} d={d} fill="var(--ink)" />
        ))}
        <path d={CFP_BALL} fill={`url(#${gid})`} />
        <path d={CFP_LACES} fill="#fff" />
      </svg>
    );
  }

  const key = bowlArtKey(assetName, name);
  const shapes = key ? BOWL_ART[key] : null;
  if (!shapes?.length) return null;
  const p = readable(primary);
  const s2 = readable(secondary);
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      role="img"
      aria-label={title ?? name}
      style={{ display: 'inline-block', verticalAlign: 'middle', flex: 'none' }}
    >
      {title && <title>{title}</title>}
      {shapes.map((s, i) => bowlShapeNode(s, i, p, s2))}
    </svg>
  );
}
