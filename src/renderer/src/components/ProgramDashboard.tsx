import type { BowlAppearance, SeasonRecord, SeasonState, Snapshot } from '../../../shared/types.ts';

type School = NonNullable<Snapshot['school']>;

const SLOT_W = 46;
const BAR_W = 22;
const CHART_H = 140;
const BASE_Y = 118;
const BAR_MAX = 90;

function badge(s: SeasonRecord): { text: string; fill: string; size: number } | null {
  if (s.natlChamp || s.bowl) return null;
  if (s.cfpMade) return { text: 'CFP', fill: 'var(--ink-3)', size: 7 };
  if (s.confChamp) return { text: 'CONF', fill: 'var(--ink-3)', size: 7 };
  return null;
}

/**
 * A bowl mark, drawn in the bowl's own brand colors from the save — the game
 * ships no readable bowl logo art, so the football carries the colors and the
 * caption carries the name. Won fills solid, lost stays outlined; playoff bowls
 * take the gold outline.
 */
function BowlCrest({ cx, bottom, bowl }: { cx: number; bottom: number; bowl: BowlAppearance }) {
  const w = 7.5;
  const h = 5;
  const cy = bottom - h;
  const stroke = bowl.playoff ? 'var(--dev-elite)' : bowl.won ? bowl.secondary : bowl.primary;
  return (
    <g>
      <path
        d={`M ${cx - w} ${cy} Q ${cx} ${cy - h} ${cx + w} ${cy} Q ${cx} ${cy + h} ${cx - w} ${cy} Z`}
        fill={bowl.won ? bowl.primary : 'transparent'}
        stroke={stroke}
        strokeWidth={1.2}
      />
      {bowl.won && (
        <line
          x1={cx - 2.4}
          y1={cy}
          x2={cx + 2.4}
          y2={cy}
          stroke={bowl.secondary}
          strokeWidth={1}
          opacity={0.9}
        />
      )}
    </g>
  );
}

/**
 * The College Football Playoff mark (CFP letters + gold football), inlined from
 * the official vector so it ships offline; letters follow the theme ink.
 */
function CfpMark({ cx, bottom, h }: { cx: number; bottom: number; h: number }) {
  const s = h / 54;
  const w = 120 * s;
  return (
    <g transform={`translate(${cx - w / 2} ${bottom - h}) scale(${s})`}>
      <path
        d="M4.48577 41.9203L0 37.4268V15.2704L4.48577 10.777H18.3439L22.8297 15.2704V21.0535H16.6106V17.8494L15.679 16.9163H7.15068L6.21909 17.8494V34.845L7.15068 35.7781H15.679L16.6106 34.845V31.641H22.8297V37.424L18.3439 41.9175H4.48577V41.9203Z"
        fill="var(--ink)"
      />
      <path
        d="M25.4946 41.9203V10.777H46.1025V16.9163H31.7109V23.5024H41.6591V29.1977H31.7109V41.9232H25.4918L25.4946 41.9203Z"
        fill="var(--ink)"
      />
      <path
        d="M54.3175 32.1302V41.9176H48.0984V10.7742H66.4423L70.9281 15.2677V27.6368L66.4423 32.1302H54.3175ZM64.7118 17.8495L63.7802 16.9163H54.3203V25.9938H63.7802L64.7118 25.0605V17.8523V17.8495Z"
        fill="var(--ink)"
      />
      <path
        d="M96.0726 0.0255421C96.2533 -0.0536382 96.4565 0.0594774 96.4565 0.251772V2.44337C96.4565 2.62719 96.369 2.79969 96.2222 2.91563C89.3312 8.1896 84.3373 16.7892 84.3373 26.2343C84.3373 35.6793 89.3312 44.2761 96.2222 49.5501C96.3719 49.6631 96.4594 49.8385 96.4594 50.0251V52.2138C96.4594 52.4062 96.2533 52.5221 96.0754 52.4401C87.4708 48.5376 78.4796 37.6843 78.4796 26.2314C78.4796 14.7786 87.4708 3.85448 96.0754 0.0227158L96.0726 0.0255421ZM85.7376 41.0268C85.921 41.2926 86.3332 41.0382 86.1695 40.7582C86.0763 40.597 85.9832 40.4386 85.8929 40.2774C83.3606 35.8038 82.0225 30.9455 82.0225 26.2343C82.0225 21.523 83.3606 16.6647 85.8929 12.1911C85.9832 12.0299 86.0763 11.8715 86.1695 11.7103C86.3332 11.4303 85.9239 11.1759 85.7376 11.4417C85.7263 11.4586 85.715 11.4756 85.7009 11.4925C82.4911 16.1274 80.7945 21.2261 80.7945 26.2343C80.7945 31.2424 82.4911 36.3411 85.7009 40.976C85.7122 40.9929 85.7234 41.0099 85.7376 41.0268ZM119.007 26.2343C119.007 37.6843 110.015 48.5376 101.411 52.443C101.233 52.525 101.027 52.409 101.027 52.2167V50.028C101.027 49.8413 101.115 49.6688 101.264 49.5528C108.155 44.2761 113.149 35.6793 113.149 26.2371C113.149 16.792 108.155 8.19526 101.264 2.91846C101.115 2.80533 101.03 2.63284 101.03 2.4462V0.254601C101.03 0.0623059 101.236 -0.0508097 101.414 0.0283706C110.018 3.8573 119.009 14.7842 119.009 26.2371L119.007 26.2343ZM111.783 40.976C114.993 36.3411 116.689 31.2424 116.689 26.2343C116.689 21.2261 114.993 16.1274 111.783 11.4925C111.771 11.4756 111.76 11.4586 111.745 11.4417C111.562 11.1759 111.151 11.4303 111.314 11.7103C111.407 11.8686 111.5 12.0299 111.591 12.1911C114.123 16.6647 115.461 21.523 115.461 26.2343C115.461 30.9455 114.123 35.8038 111.591 40.2774C111.5 40.4386 111.407 40.5999 111.314 40.7582C111.151 41.0382 111.56 41.2926 111.745 41.0268C111.758 41.0099 111.769 40.9929 111.783 40.976Z"
        fill="url(#cfp-gold)"
      />
      <path
        d="M102.151 18.7148H95.3358C95.1348 18.7148 94.9717 18.8782 94.9717 19.0797V20.2221C94.9717 20.4236 95.1348 20.5869 95.3358 20.5869H102.151C102.352 20.5869 102.515 20.4236 102.515 20.2221V19.0797C102.515 18.8782 102.352 18.7148 102.151 18.7148ZM102.151 23.1292H95.3358C95.1348 23.1292 94.9717 23.2925 94.9717 23.4939V24.6335C94.9717 24.835 95.1348 24.9984 95.3358 24.9984H102.151C102.352 24.9984 102.515 24.835 102.515 24.6335V23.4939C102.515 23.2925 102.352 23.1292 102.151 23.1292ZM102.151 27.5436H95.3358C95.1348 27.5436 94.9717 27.7069 94.9717 27.9084V29.0508C94.9717 29.2523 95.1348 29.4157 95.3358 29.4157H102.151C102.352 29.4157 102.515 29.2523 102.515 29.0508V27.9084C102.515 27.7069 102.352 27.5436 102.151 27.5436ZM102.151 31.9578H95.3358C95.1348 31.9578 94.9717 32.1212 94.9717 32.3226V33.4651C94.9717 33.6666 95.1348 33.8298 95.3358 33.8298H102.151C102.352 33.8298 102.515 33.6666 102.515 33.4651V32.3226C102.515 32.1212 102.352 31.9578 102.151 31.9578Z"
        fill="#fff"
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
  return `${s.year} — ${s.wins}–${s.losses}${notes.length ? ` · ${notes.join(' · ')}` : ''}`;
}

function RecordGraph({ seasons, color }: { seasons: SeasonRecord[]; color: string }) {
  if (!seasons.length) {
    return (
      <div style={{ color: 'var(--ink-3)', fontSize: 12.5, padding: '18px 0' }}>
        No games on record yet — the graph starts with your first result.
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
      <defs>
        <linearGradient
          id="cfp-gold"
          x1="121.155"
          y1="41.9629"
          x2="73.6889"
          y2="8.73581"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0.11" stopColor="#C69139" />
          <stop offset="0.2" stopColor="#E5B75D" />
          <stop offset="0.35" stopColor="#FFD97C" />
          <stop offset="0.47" stopColor="#FCE991" />
          <stop offset="0.6" stopColor="#EBC671" />
          <stop offset="0.72" stopColor="#C09139" />
          <stop offset="0.83" stopColor="#B48E3D" />
          <stop offset="1" stopColor="#946E2A" />
        </linearGradient>
      </defs>
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
            {s.natlChamp && <CfpMark cx={cx} bottom={top - 14} h={12} />}
            {!s.natlChamp && s.bowl && <BowlCrest cx={cx} bottom={top - 16} bowl={s.bowl} />}
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
  if (!rc && !seasons.length) {
    return <div className="empty">Reading your dynasty save…</div>;
  }
  const dynastyYear = season?.dynastyYear ?? 0;
  const truncated = seasons.length > 0 && seasons.length < Math.min(8, dynastyYear);
  const bowls = seasons.filter((s) => s.bowl);

  return (
    <div className="two-col" style={{ marginTop: 16 }}>
      <div className="panel">
        <div className="panel-title">Season Records</div>
        <RecordGraph seasons={seasons} color={school.team.colors.primary} />
        {bowls.length > 0 && (
          <div style={{ fontSize: 11.5, color: 'var(--ink-2)', marginTop: 10, lineHeight: 1.6 }}>
            {bowls.map((s) => (
              <span key={s.year} style={{ marginRight: 12, whiteSpace: 'nowrap' }}>
                <span
                  style={{
                    display: 'inline-block',
                    width: 9,
                    height: 6,
                    borderRadius: '50% / 50%',
                    marginRight: 5,
                    verticalAlign: 'middle',
                    background: s.bowl!.won ? s.bowl!.primary : 'transparent',
                    border: `1px solid ${s.bowl!.playoff ? 'var(--dev-elite)' : s.bowl!.primary}`
                  }}
                />
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
            The game keeps five seasons of records — earlier years stay on the graph once they have
            appeared here.
          </div>
        )}
      </div>
      <div className="panel">
        <div className="panel-title">Your Pipelines</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {(rc?.pipelines ?? []).map((p) => (
            <span key={p.pipeline} className="chip" title={`Influence ${p.value}`}>
              <b>{p.label}</b>&nbsp;
              <span style={{ color: p.tier >= 4 ? 'var(--dev-elite)' : 'var(--ink-3)' }}>{p.level}</span>
            </span>
          ))}
          {!rc?.pipelines.length && <span style={{ color: 'var(--ink-3)' }}>No established pipelines.</span>}
        </div>
      </div>
      <div className="panel" style={{ gridColumn: '1 / -1' }}>
        <div className="panel-title">Program Grades</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {(rc?.reportCard ?? []).map((g) => (
            <span key={g.label} className="chip">
              {g.label}&nbsp;<span className={`grade ${g.grade.startsWith('A') ? 'good' : ''}`}>{g.grade}</span>
            </span>
          ))}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
          {(rc?.proPotential ?? []).map((g) => (
            <span key={g.label} className="chip" title={`Pro potential — ${g.label}`}>
              <span className="k">{g.label}</span>&nbsp;
              <span className={`grade ${g.grade.startsWith('A') ? 'good' : ''}`}>{g.grade}</span>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
