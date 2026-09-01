import { useEffect, useState } from 'react';
import type { TeamInfo } from '../../../shared/types.ts';

/**
 * A top-down broadcast field dressed for one program. When the game's own
 * field paint has been extracted (`node scripts/extract-field-art.ts`), the
 * end zones and midfield use the team's authentic swappable textures —
 * exactly the art the game lays on that school's turf. Without the
 * extraction the field falls back to drawn end zones in the save's team
 * colors with the school name lettered in, and the bundled logo at the 50.
 */

const YD = 10; // px per yard
const FIELD_W = 120 * YD; // 100 yards + two 10-yard end zones
const FIELD_H = 53.3 * YD;
const PAD = 14;
const NUMS = [10, 20, 30, 40, 50, 40, 30, 20, 10];

/** displayName -> the game's field-art folder slug, where lowercasing isn't enough. */
const SLUG_FIXUPS: Record<string, string> = {
  Miami: 'miami-fl',
  'Miami (OH)': 'miami-oh',
  'Texas A&M': 'texas-am',
  Louisiana: 'louisiana-lafayette',
  'UL Monroe': 'louisiana-monroe',
  'App State': 'appalachian-state',
  'Sam Houston': 'sam-houston-state',
  'Southern Miss': 'southern-miss',
  'Western Kentucky': 'wku',
  'Middle Tennessee': 'middle-tennessee'
};

function slugFor(team: TeamInfo): string {
  const name = team.displayName || team.shortName || '';
  if (SLUG_FIXUPS[name]) return SLUG_FIXUPS[name];
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const probeCache = new Map<string, Promise<boolean>>();
function probe(url: string): Promise<boolean> {
  let p = probeCache.get(url);
  if (!p) {
    p = new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(true);
      img.onerror = () => resolve(false);
      img.src = url;
    });
    probeCache.set(url, p);
  }
  return p;
}

function useArt(url: string): boolean {
  const [ok, setOk] = useState(false);
  useEffect(() => {
    let alive = true;
    setOk(false);
    void probe(url).then((hit) => {
      if (alive && hit) setOk(true);
    });
    return () => {
      alive = false;
    };
  }, [url]);
  return ok;
}

export default function FieldGraphic({ team, cover }: { team: TeamInfo; cover?: boolean }) {
  const primary = team.colors.primary || '#1c2733';
  const secondary = team.colors.secondary || '#ffffff';
  const name = (team.displayName || team.shortName || '').toUpperCase();
  const slug = slugFor(team);
  const ezNorthUrl = `gameicon://field-${slug}-ezn`;
  const ezSouthUrl = `gameicon://field-${slug}-ezs`;
  const midUrl = `gameicon://field-${slug}-mid`;
  const haveEzN = useArt(ezNorthUrl);
  const haveEzS = useArt(ezSouthUrl);
  const haveMid = useArt(midUrl);

  const w = FIELD_W + PAD * 2;
  const h = FIELD_H + PAD * 2;
  const gy = (yd: number) => PAD + (10 + yd) * YD; // x of a yard line (0 = own goal line)
  const ezCx = (left: boolean) => PAD + (left ? 5 : 115) * YD;
  const midSize = 22 * YD; // authentic midfield art spans about twenty yards

  return (
    <svg
      className="field-graphic"
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio={cover ? 'xMidYMid slice' : 'xMidYMid meet'}
      role="img"
      aria-label={`${team.displayName} field`}
    >
      {/* apron + team frame */}
      <rect x="0" y="0" width={w} height={h} fill="#1e3b23" />
      <rect
        x={PAD - 6}
        y={PAD - 6}
        width={FIELD_W + 12}
        height={FIELD_H + 12}
        fill="none"
        stroke={primary}
        strokeWidth="6"
      />

      {/* turf: alternating 5-yard mowing bands between the goal lines */}
      <rect x={PAD} y={PAD} width={FIELD_W} height={FIELD_H} fill="#2c6b35" />
      {Array.from({ length: 20 }, (_, i) => (
        <rect
          key={`band${i}`}
          x={gy(i * 5)}
          y={PAD}
          width={5 * YD}
          height={FIELD_H}
          fill={i % 2 === 0 ? '#2c6b35' : '#276030'}
        />
      ))}

      {/* end zones: the game's own paint when extracted, team colors when not */}
      {[true, false].map((left) => {
        const x = PAD + (left ? 0 : 110 * YD);
        const haveArt = left ? haveEzN : haveEzS;
        const url = left ? ezNorthUrl : ezSouthUrl;
        return (
          <g key={left ? 'ezl' : 'ezr'}>
            <rect x={x} y={PAD} width={10 * YD} height={FIELD_H} fill={primary} />
            {haveArt ? (
              <image
                href={url}
                x={ezCx(left) - FIELD_H / 2}
                y={PAD + FIELD_H / 2 - 5 * YD}
                width={FIELD_H}
                height={10 * YD}
                preserveAspectRatio="none"
                transform={`rotate(${left ? -90 : 90} ${ezCx(left)} ${PAD + FIELD_H / 2})`}
              />
            ) : (
              <text
                className="fg-ez"
                x={ezCx(left)}
                y={PAD + FIELD_H / 2}
                fill={secondary}
                transform={`rotate(${left ? -90 : 90} ${ezCx(left)} ${PAD + FIELD_H / 2})`}
                textLength={name.length > 8 ? FIELD_H * 0.82 : undefined}
                lengthAdjust="spacingAndGlyphs"
              >
                {name}
              </text>
            )}
          </g>
        );
      })}

      {/* boundary + yard lines */}
      <rect
        x={PAD}
        y={PAD}
        width={FIELD_W}
        height={FIELD_H}
        fill="none"
        stroke="#f2f4f0"
        strokeWidth="3"
      />
      {Array.from({ length: 21 }, (_, i) => (
        <line
          key={`yl${i}`}
          x1={gy(i * 5)}
          y1={PAD}
          x2={gy(i * 5)}
          y2={PAD + FIELD_H}
          stroke="#f2f4f0"
          strokeWidth={i === 0 || i === 20 ? 3 : 1.6}
          opacity={i % 2 === 0 ? 1 : 0.85}
        />
      ))}

      {/* hash rows */}
      {Array.from({ length: 99 }, (_, i) => {
        const x = gy(i + 1);
        return (
          <g key={`h${i}`} stroke="#f2f4f0" strokeWidth="1.1" opacity="0.8">
            <line x1={x} y1={PAD + FIELD_H * 0.38} x2={x} y2={PAD + FIELD_H * 0.38 + 6} />
            <line x1={x} y1={PAD + FIELD_H * 0.62 - 6} x2={x} y2={PAD + FIELD_H * 0.62} />
          </g>
        );
      })}

      {/* numbers with direction ticks */}
      {NUMS.map((n, i) => {
        const x = gy((i + 1) * 10);
        const arrowLeft = i < 4;
        const arrowRight = i > 4;
        const tick = (tx: number, flip: boolean) => (
          <path
            d={flip ? `M${tx + 4} -5 l6 5 l-6 5 z` : `M${tx - 4} -5 l-6 5 l6 5 z`}
            fill="#f2f4f0"
          />
        );
        return (
          <g key={`num${i}`}>
            <g transform={`translate(${x} ${PAD + FIELD_H - 42}) `}>
              <text className="fg-num" fill="#f2f4f0">
                {n}
              </text>
              {arrowLeft && tick(-26, false)}
              {arrowRight && tick(26, true)}
            </g>
            <g transform={`translate(${x} ${PAD + 42}) rotate(180)`}>
              <text className="fg-num" fill="#f2f4f0">
                {n}
              </text>
              {arrowLeft && tick(-26, false)}
              {arrowRight && tick(26, true)}
            </g>
          </g>
        );
      })}

      {/* midfield: authentic paint when extracted, the bundled mark when not */}
      {haveMid ? (
        <image
          href={midUrl}
          x={PAD + 60 * YD - midSize / 2}
          y={PAD + FIELD_H / 2 - midSize / 2}
          width={midSize}
          height={midSize}
          preserveAspectRatio="xMidYMid meet"
        />
      ) : (
        <image
          href={`logo://${team.row}`}
          x={PAD + 60 * YD - 42}
          y={PAD + FIELD_H / 2 - 42}
          width="84"
          height="84"
          preserveAspectRatio="xMidYMid meet"
        />
      )}
    </svg>
  );
}
