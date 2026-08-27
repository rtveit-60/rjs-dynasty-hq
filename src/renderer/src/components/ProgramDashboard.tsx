import type { BowlAppearance, SeasonRecord, SeasonState, Snapshot } from '../../../shared/types.ts';
import BowlIcon, { BowlMarkGroup, CfpMarkGroup } from './BowlIcon.tsx';

type School = NonNullable<Snapshot['school']>;

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
