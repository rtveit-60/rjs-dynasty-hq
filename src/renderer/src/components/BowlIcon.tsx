import { BOWL_ART, readable, type BowlShape } from '../lib/bowl-art.ts';
import { BOWL_LOGOS } from '../lib/bowl-logos.ts';
import { CFP_BALL, CFP_GOLD_STOPS, CFP_LACES, CFP_LETTERS, isPlayoffRound } from '../lib/cfp-mark.ts';

/**
 * Bowls wear their real bundled logo; one with no bundled art wears the plain
 * generic football from `bowl-art.ts` in its own colors — never the themed
 * hand-drawn set, which stays benched for the preview sheet only
 * (`node scripts/bowl-preview.ts`). The bundled set currently covers every
 * real bowl in the save; only the game's placeholder "Generic Bowl" row (and
 * any bowl a future title update adds) takes the football.
 */
const GENERIC_MARK = BOWL_ART.Generic;

/**
 * Logos drawn as dark ink on transparency. They read fine on the light paper
 * but vanish against the dark panel, so they get a light plaque behind them.
 * Eyeballed against the bundled set — add to this list if a new logo disappears
 * in dark mode (see `node scripts/fetch-bowl-logos.ts`).
 */
const DARK_INK_LOGOS = new Set(['Rose_Bowl', 'First_Responder_Bowl']);

/** The bundled logo key for a bowl, or null when we have no real art for it. */
export function bowlLogoKey(assetName: string, name: string): string | null {
  if (assetName && BOWL_LOGOS.has(assetName)) return assetName;
  const slug = name.replace(/[^A-Za-z0-9]+/g, '_');
  return BOWL_LOGOS.has(slug) ? slug : null;
}

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

  const logo = bowlLogoKey(assetName, name);
  if (logo) {
    return (
      <>
        {DARK_INK_LOGOS.has(logo) && (
          <rect
            className="bowl-plaque-rect"
            x={cx - size / 2 - 1}
            y={bottom - size - 1}
            width={size + 2}
            height={size + 2}
            rx={2}
          />
        )}
        <image
          href={`bowl://${logo}`}
          x={cx - size / 2}
          y={bottom - size}
          width={size}
          height={size}
          preserveAspectRatio="xMidYMid meet"
        />
      </>
    );
  }
  if (!name) return null;

  const k = size / 24;
  const p = readable(primary);
  const s2 = readable(secondary);
  return (
    <g transform={`translate(${cx - size / 2} ${bottom - size}) scale(${k})`}>
      {GENERIC_MARK.map((s, i) => bowlShapeNode(s, i, p, s2))}
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
 * The bowl's bundled logo. Playoff rounds wear the CFP mark; a bowl with no
 * bundled art wears the generic football in its own colors (see GENERIC_MARK).
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

  const logo = bowlLogoKey(assetName, name);
  if (logo) {
    const img = (
      <img
        src={`bowl://${logo}`}
        alt={title ?? name}
        title={title}
        width={size}
        height={size}
        style={{ display: 'block', objectFit: 'contain', flex: 'none' }}
      />
    );
    return DARK_INK_LOGOS.has(logo) ? (
      <span className="bowl-plaque" style={{ verticalAlign: 'middle' }}>
        {img}
      </span>
    ) : (
      <span style={{ display: 'inline-flex', verticalAlign: 'middle' }}>{img}</span>
    );
  }
  if (!name) return null;

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
      {GENERIC_MARK.map((s, i) => bowlShapeNode(s, i, p, s2))}
    </svg>
  );
}
