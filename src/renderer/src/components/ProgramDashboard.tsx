import { useEffect, useState } from 'react';
import type { BowlAppearance, SeasonRecord, SeasonState, Snapshot } from '../../../shared/types.ts';
import { spaceOut } from '../lib/format.ts';
import BowlIcon, { BowlMarkGroup, CfpMarkGroup } from './BowlIcon.tsx';
import ContractPanel from './ContractPanel.tsx';
import FieldGraphic from './FieldGraphic.tsx';

type School = NonNullable<Snapshot['school']>;

/**
 * Pipeline tier badge the way the game draws it: its own map-pin texture
 * (`dynas_general_Pipeline_Empty`, extracted from the user's install by
 * `node scripts/extract-game-icons.ts` — the game ships only this shell and
 * tints it per tier with a number on top, so we composite it the same way).
 * Metals follow the game's ladder: bronze, silver, gold, teal, amethyst.
 * When the extracted texture is absent (fresh clone), a drawn SVG pin stands in.
 */
const PIN_METALS: Record<number, { hi: string; body: string; rim: string; num: string }> = {
  1: { hi: '#b07a42', body: '#8a5a2b', rim: '#54361a', num: '#38220f' },
  2: { hi: '#c9ccd1', body: '#a8abb0', rim: '#63666b', num: '#3f4247' },
  3: { hi: '#e0bc56', body: '#c9a03c', rim: '#7d6021', num: '#503d13' },
  4: { hi: '#74c2d6', body: '#4fa3b8', rim: '#2a6b7d', num: '#173f4b' },
  5: { hi: '#c37fe0', body: '#a957c9', rim: '#6d3689', num: '#3f1e53' }
};

const PIN_TEXTURE = 'gameicon://pipeline-pin';
let pinProbe: Promise<string | null> | undefined;
function probePinTexture(): Promise<string | null> {
  // CSS mask-image cannot fetch the gameicon: scheme, so the texture is
  // converted to a data URL once and masked from that.
  pinProbe ??= new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const c = document.createElement('canvas');
        c.width = img.naturalWidth;
        c.height = img.naturalHeight;
        c.getContext('2d')!.drawImage(img, 0, 0);
        resolve(c.toDataURL('image/png'));
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = PIN_TEXTURE;
  });
  return pinProbe;
}

function TierPin({ tier }: { tier: number }) {
  const [texture, setTexture] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    void probePinTexture().then((url) => {
      if (alive && url) setTexture(url);
    });
    return () => {
      alive = false;
    };
  }, []);
  const metal = PIN_METALS[tier];

  if (texture) {
    const mask: React.CSSProperties = {
      position: 'absolute',
      inset: 0,
      WebkitMaskImage: `url(${texture})`,
      maskImage: `url(${texture})`,
      WebkitMaskSize: '100% 100%',
      maskSize: '100% 100%',
      background: metal
        ? `linear-gradient(155deg, ${metal.hi} 18%, ${metal.body} 55%, ${metal.rim} 96%)`
        : 'var(--line-soft)'
    };
    return (
      <span
        style={{ position: 'relative', width: 16, height: 19, flexShrink: 0, display: 'inline-block' }}
        aria-label={`Tier ${tier} of 5`}
      >
        <span style={mask} />
        {metal && (
          <span
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              top: 0,
              height: '64%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 9.5,
              fontWeight: 800,
              fontFamily: 'var(--font-display, sans-serif)',
              color: metal.num
            }}
          >
            {tier}
          </span>
        )}
      </span>
    );
  }

  return (
    <svg
      width="15"
      height="19"
      viewBox="0 0 20 26"
      style={{ display: 'block', flexShrink: 0 }}
      aria-label={`Tier ${tier} of 5`}
    >
      <path
        d="M10 1 C4.9 1 1 4.9 1 10 c0 6 9 15 9 15 s9 -9 9 -15 C19 4.9 15.1 1 10 1 Z"
        fill={metal ? metal.body : 'transparent'}
        stroke={metal ? metal.rim : 'var(--ink-3)'}
        strokeWidth="1.6"
      />
      {metal && (
        <text
          x="10"
          y="14.2"
          textAnchor="middle"
          fontSize="11.5"
          fontWeight="800"
          fontFamily="var(--font-display, sans-serif)"
          fill={metal.num}
        >
          {tier}
        </text>
      )}
    </svg>
  );
}

const SLOT_W = 46;
const BAR_W = 22;
const CHART_H = 150;
const BASE_Y = 128;
// Leaves headroom above the tallest bar for the record line and the bowl logo.
const BAR_MAX = 86;

function badge(s: SeasonRecord): { text: string; fill: string; size: number } | null {
  if (s.natlChamp || s.bowl) return null;
  if (s.cfpMade) return { text: 'CFP', fill: 'var(--ink-3)', size: 7 };
  if (s.confChamp) return { text: 'CONF', fill: 'var(--ink-3)', size: 7 };
  return null;
}

/** A season's bowl mark above its bar; a loss is dimmed. */
function BowlCrest({ cx, bottom, bowl }: { cx: number; bottom: number; bowl: BowlAppearance }) {
  return (
    <g opacity={bowl.won ? 1 : 0.62}>
      <BowlMarkGroup
        assetName={bowl.assetName}
        name={bowl.name}
        primary={bowl.primary}
        secondary={bowl.secondary}
        cx={cx}
        bottom={bottom}
        size={22}
      />
    </g>
  );
}

function tooltip(s: SeasonRecord): string {
  const notes = [
    s.natlChamp && 'National Champions',
    s.confChamp && 'Conference Champions',
    s.cfpMade && !s.bowl?.playoff && 'CFP',
    s.bowl ? `${s.bowl.name} (${s.bowl.won ? 'W' : 'L'})` : s.bowlWon && 'Bowl win',
    s.inProgress && 'In progress'
  ].filter(Boolean);
  return `${s.year}: ${s.wins}–${s.losses}${notes.length ? ` · ${notes.join(' · ')}` : ''}`;
}

function RecordGraph({ seasons, color }: { seasons: SeasonRecord[]; color: string }) {
  if (!seasons.length) {
    return (
      <div style={{ color: 'var(--ink-3)', fontSize: 12.5, padding: '18px 0' }}>
        No games on record yet. The graph starts with your first result.
      </div>
    );
  }
  const norm = Math.max(12, ...seasons.map((s) => s.wins + s.losses));
  const width = seasons.length * SLOT_W;
  return (
    <svg
      viewBox={`0 0 ${width} ${CHART_H}`}
      style={{ width: '100%', maxWidth: seasons.length * 62, display: 'block' }}
      role="img"
      aria-label="Win-loss record by season"
    >
      {seasons.map((s, i) => {
        const x = i * SLOT_W + (SLOT_W - BAR_W) / 2;
        const cx = i * SLOT_W + SLOT_W / 2;
        const hw = (s.wins / norm) * BAR_MAX;
        const hl = (s.losses / norm) * BAR_MAX;
        const top = BASE_Y - hw - hl;
        const b = badge(s);
        return (
          <g key={s.year} opacity={s.inProgress ? 0.6 : 1}>
            <title>{tooltip(s)}</title>
            {hl > 0 && <rect x={x} y={top} width={BAR_W} height={hl} fill="var(--ink-3)" opacity={0.3} />}
            {hw > 0 && <rect x={x} y={BASE_Y - hw} width={BAR_W} height={hw} fill={color} />}
            <text
              x={cx}
              y={top - 5}
              textAnchor="middle"
              fontSize={10.5}
              fontWeight={700}
              fill={s.inProgress ? 'var(--ink-3)' : 'var(--ink)'}
            >
              {s.wins}–{s.losses}
            </text>
            {s.natlChamp && !s.bowl && <CfpMarkGroup cx={cx} bottom={top - 14} h={12} />}
            {s.bowl && <BowlCrest cx={cx} bottom={top - 15} bowl={s.bowl} />}
            {b && (
              <text x={cx} y={top - 17} textAnchor="middle" fontSize={b.size} fontWeight={700} fill={b.fill}>
                {b.text}
              </text>
            )}
            <text x={cx} y={BASE_Y + 14} textAnchor="middle" fontSize={10} fontWeight={600} fill="var(--ink-3)">
              {'’'}
              {String(s.year).slice(2)}
            </text>
          </g>
        );
      })}
      <line x1={0} y1={BASE_Y} x2={width} y2={BASE_Y} stroke="var(--line)" strokeWidth={1} />
    </svg>
  );
}

export default function ProgramDashboard({
  school,
  season
}: {
  school: School;
  season: SeasonState | null;
}) {
  const rc = school.recruiting;
  const seasons = school.seasonHistory ?? [];
  if (!rc && !seasons.length && !school.contract) {
    return <div className="empty">Reading your dynasty save…</div>;
  }
  const dynastyYear = season?.dynastyYear ?? 0;
  const truncated = seasons.length > 0 && seasons.length < Math.min(8, dynastyYear);
  const bowls = seasons.filter((s) => s.bowl);

  return (
    <div className="dash-stage">
    <div className="dash-field" aria-hidden="true">
      <FieldGraphic team={school.team} />
    </div>
    <div className="two-col" style={{ marginTop: 16 }}>
      <div className="panel">
        <div className="panel-title">Season Records</div>
        <RecordGraph seasons={seasons} color={school.team.colors.primary} />
        {bowls.length > 0 && (
          <div style={{ fontSize: 11.5, color: 'var(--ink-2)', marginTop: 10, lineHeight: 1.6 }}>
            {bowls.map((s) => (
              <span key={s.year} style={{ marginRight: 14, whiteSpace: 'nowrap' }}>
                <span style={{ marginRight: 5, verticalAlign: 'middle', display: 'inline-block' }}>
                  <BowlIcon
                    assetName={s.bowl!.assetName}
                    name={s.bowl!.name}
                    primary={s.bowl!.primary}
                    secondary={s.bowl!.secondary}
                    size={22}
                    title={s.bowl!.name}
                  />
                </span>
                <span style={{ color: 'var(--ink-3)' }}>{'’'}{String(s.year).slice(2)}</span>{' '}
                {s.bowl!.name}{' '}
                <span style={{ color: s.bowl!.won ? 'var(--good)' : 'var(--ink-3)', fontWeight: 700 }}>
                  {s.bowl!.won ? 'W' : 'L'}
                </span>
              </span>
            ))}
          </div>
        )}
        {truncated && (
          <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 8 }}>
            The game keeps five seasons of records. Earlier years stay on the graph once they have
            appeared here.
          </div>
        )}
      </div>
      {school.contract && <ContractPanel contract={school.contract} />}
      <div className="panel">
        <div className="panel-title">Your Pipelines</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {(rc?.pipelines ?? []).map((p) => (
            <span
              key={p.pipeline}
              className="chip"
              title={`Tier ${p.tier} of 5 · ${spaceOut(p.level)} · influence ${p.value}`}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}
            >
              <b>{p.label}</b>
              <TierPin tier={p.tier} />
            </span>
          ))}
          {!rc?.pipelines.length && <span style={{ color: 'var(--ink-3)' }}>No established pipelines.</span>}
        </div>
      </div>
      <div className="panel">
        <div className="panel-title">Program Grades</div>
        <div className="grade-grid">
          {(rc?.reportCard ?? []).map((g) => (
            <span key={g.label} className="chip grade-cell">
              <span className="grade-lbl">{g.label}</span><span className={`grade ${g.grade.startsWith('A') ? 'good' : ''}`}>{g.grade}</span>
            </span>
          ))}
        </div>
      </div>
    </div>
    </div>
  );
}
