import { useMemo, useState } from 'react';
import type { CarouselEntry } from '../../../shared/types.ts';
import { useHQ } from '../store.ts';
import InfoDot, { InfoRow } from './InfoDot.tsx';
import { NameLink } from './ProfileModal.tsx';
import TeamLogo from './TeamLogo.tsx';

const STATUS: Record<string, { label: string; color: string }> = {
  Safe: { label: 'Safe', color: 'var(--good)' },
  SafeForNow: { label: 'Safe for now', color: 'var(--ink-2)' },
  Low: { label: 'Low', color: 'var(--dev-elite)' },
  HotSeat: { label: 'Hot seat', color: 'var(--bad)' }
};

type RoleFilter = 'ALL' | 'HC' | 'OC' | 'DC';
type SortKey =
  | 'team'
  | 'coach'
  | 'role'
  | 'age'
  | 'rec'
  | 'security'
  | 'seat'
  | 'contract'
  | 'ad'
  | 'outlook';

/**
 * Outlook tags beyond the seat itself — every tag maps to a save fact, no
 * invented odds. The hot seat has its flame column and the AD's temperament
 * has its own column, so neither repeats here. Expiring deals only read as a
 * risk when the seat already isn't Safe — secure coaches get renewed.
 */
function openingReasons(c: CarouselEntry): string[] {
  const reasons: string[] = [];
  if (c.securityStatus === 'Low') reasons.push('LOW SECURITY');
  if (c.yearsRemaining <= 1 && c.securityStatus !== 'Safe') reasons.push('EXPIRING DEAL');
  return reasons;
}

/**
 * Forecast tiers, deliberately narrow: "likely open" is the game's own hot
 * seat; "at risk" is low security compounded by an expiring deal or a
 * trigger-happy AD. Everything else is presumed to survive the offseason.
 */
const likelyOpen = (c: CarouselEntry) => c.securityStatus === 'HotSeat';
const atRisk = (c: CarouselEntry, adDemeanor: string | null) =>
  c.securityStatus === 'Low' &&
  (c.yearsRemaining <= 1 || adDemeanor === 'Impatient' || adDemeanor === 'Reactionary');

/** Coordinator seats in free fall — hot seat with security at or under 20%. */
const coordDone = (c: CarouselEntry) =>
  c.role !== 'HC' && c.securityStatus === 'HotSeat' && c.securityPct <= 20;

const REASON_LABEL: Record<string, { label: string; hot?: boolean }> = {
  Fired: { label: 'FIRED', hot: true },
  Retired: { label: 'RETIRED' },
  Pro: { label: 'LEFT FOR NFL' },
  NewJob: { label: 'POACHED' },
  ContractEnding: { label: 'CONTRACT UP' },
  None: { label: 'OPEN' }
};

function SecurityCell({ pct, status }: { pct: number; status: string }) {
  const s = STATUS[status] ?? { label: status, color: 'var(--ink-2)' };
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 120 }} title={s.label}>
      <span
        style={{
          flex: 1,
          height: 5,
          borderRadius: 3,
          background: 'var(--line-soft)',
          overflow: 'hidden',
          display: 'inline-block'
        }}
      >
        <span
          style={{
            display: 'block',
            width: `${Math.max(0, Math.min(100, pct))}%`,
            height: '100%',
            background: s.color
          }}
        />
      </span>
      <b style={{ color: s.color, fontSize: 12, width: 34, textAlign: 'right' }}>{pct}%</b>
    </div>
  );
}

/** The hot-seat flame — drawn, theme-red, with an ember core. */
function Flame({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size + 2} viewBox="0 0 16 18" aria-label="Hot seat" style={{ display: 'block' }}>
      <path
        d="M8 0.5 C8.6 3.2 12.5 4.8 12.5 10 A4.5 4.5 0 0 1 3.5 10 C3.5 6.8 6.4 5.6 6.2 2.6 C7.1 3.6 7.7 4.4 8 0.5 Z"
        fill="var(--bad)"
      />
      <path
        d="M8 8.2 C8.4 9.8 10 10.4 10 12.4 A2 2 0 0 1 6 12.4 C6 10.9 7.4 10.3 7.4 8.9 Z"
        fill="#f5a340"
      />
    </svg>
  );
}

const ROLE_ORDER: Record<string, number> = { HC: 0, OC: 1, DC: 2 };
const BOARD_CAP = 60;

export default function CarouselView() {
  const snapshot = useHQ((s) => s.snapshot);
  const [role, setRole] = useState<RoleFilter>('HC');
  const [sortKey, setSortKey] = useState<SortKey>('security');
  const [asc, setAsc] = useState(true);
  const carousel = snapshot?.carousel ?? [];
  const teams = useMemo(() => new Map((snapshot?.teams ?? []).map((t) => [t.row, t])), [snapshot]);

  /** Current-season W–L per team row, straight from the schedule. */
  const records = useMemo(() => {
    const out = new Map<number, { w: number; l: number }>();
    for (const g of snapshot?.games ?? []) {
      if (g.status === 'unplayed') continue;
      const bump = (row: number, won: boolean) => {
        const r = out.get(row) ?? { w: 0, l: 0 };
        won ? r.w++ : r.l++;
        out.set(row, r);
      };
      bump(g.homeRow, g.status === 'home');
      bump(g.awayRow, g.status === 'away');
    }
    return out;
  }, [snapshot]);

  const rows = useMemo(() => {
    const dir = asc ? 1 : -1;
    const list = (role === 'ALL' ? carousel : carousel.filter((c) => c.role === role)).map((c) => ({
      c,
      team: teams.get(c.teamRow),
      rec: records.get(c.teamRow) ?? null,
      reasons: openingReasons(c)
    }));
    const bySecurity = (a: (typeof list)[number], b: (typeof list)[number]) =>
      a.c.securityPct - b.c.securityPct;
    list.sort((a, b) => {
      switch (sortKey) {
        case 'team':
          return dir * (a.team?.longName ?? '').localeCompare(b.team?.longName ?? '');
        case 'coach':
          return dir * a.c.name.localeCompare(b.c.name);
        case 'role':
          return dir * ((ROLE_ORDER[a.c.role] ?? 9) - (ROLE_ORDER[b.c.role] ?? 9)) || bySecurity(a, b);
        case 'age':
          return dir * ((a.c.age ?? -1) - (b.c.age ?? -1)) || bySecurity(a, b);
        case 'rec': {
          const wa = a.rec ? a.rec.w - a.rec.l : -99;
          const wb = b.rec ? b.rec.w - b.rec.l : -99;
          return dir * (wa - wb) || bySecurity(a, b);
        }
        case 'seat':
          return (
            dir *
              (Number(a.c.securityStatus === 'HotSeat') - Number(b.c.securityStatus === 'HotSeat')) ||
            bySecurity(a, b)
          );
        case 'contract':
          return dir * (a.c.yearsRemaining - b.c.yearsRemaining) || bySecurity(a, b);
        case 'ad':
          return (
            dir * (a.team?.adDemeanor ?? '').localeCompare(b.team?.adDemeanor ?? '') || bySecurity(a, b)
          );
        case 'outlook':
          return dir * (a.reasons.length - b.reasons.length) || bySecurity(a, b);
        default:
          return dir * bySecurity(a, b);
      }
    });
    return list;
  }, [carousel, teams, records, role, sortKey, asc]);

  if (!carousel.length) {
    return (
      <div className="page">
        <div className="empty">No coach job-security data found in this save.</div>
      </div>
    );
  }

  const hcs = carousel.filter((c) => c.role === 'HC');
  const likelyHC = hcs.filter(likelyOpen).length;
  const atRiskHC = hcs.filter((c) => atRisk(c, teams.get(c.teamRow)?.adDemeanor ?? null)).length;
  const coordOut = carousel.filter(coordDone).length;
  const openings = snapshot?.jobOpenings ?? [];

  const sortBy = (key: SortKey, defaultAsc = true) => {
    if (sortKey === key) setAsc(!asc);
    else {
      setSortKey(key);
      setAsc(defaultAsc);
    }
  };
  const th = (label: string, key: SortKey, opts?: { num?: boolean; defaultAsc?: boolean }) => (
    <th
      className={`${opts?.num ? 'num ' : ''}${sortKey === key ? 'sorted' : ''}`}
      onClick={() => sortBy(key, opts?.defaultAsc ?? true)}
    >
      {label}
      {sortKey === key ? (asc ? ' ↑' : ' ↓') : ''}
    </th>
  );

  return (
    <div className="page">
      <div className="page-kicker">The Silly Season Desk</div>
      <h1 className="page-title">
        Coaching <span className="nick">Carousel</span>
      </h1>
      <div className="page-sub">
        {openings.length > 0 && (
          <span className="chip">
            <span className="k">OPEN JOBS</span> <b>{openings.filter((o) => !o.filled).length}</b>
          </span>
        )}
        <span className="chip" title="The game's own hot-seat designation">
          <span className="k">HC LIKELY OPEN</span> <b>{likelyHC}</b>
        </span>
        <span className="chip" title="Low security plus an expiring deal or an impatient/reactionary AD">
          <span className="k">HC AT RISK</span> <b>{atRiskHC}</b>
        </span>
        <span className="chip" title="Coordinators on the hot seat with security at or under 20%">
          <span className="k">COORDINATORS LIKELY OUT</span> <b>{coordOut}</b>
        </span>
      </div>

      {openings.length > 0 && (
        <div className="panel" style={{ marginTop: 16 }}>
          <div className="panel-title">Open Jobs · Carousel Live</div>
          {openings.map((o) => {
            const team = teams.get(o.teamRow);
            const reason = REASON_LABEL[o.reason] ?? { label: o.reason.toUpperCase() };
            return (
              <div
                key={`${o.teamRow}-${o.role}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '7px 0',
                  borderBottom: '1px solid var(--line-soft)'
                }}
              >
                <TeamLogo row={o.teamRow} size={26} fallback={null} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>
                    {team?.longName ?? `Team ${o.teamRow}`}
                    <span style={{ color: 'var(--ink-3)', fontWeight: 400 }}> · {o.role}</span>
                  </div>
                  {o.prevCoach && (
                    <div style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>was {o.prevCoach}</div>
                  )}
                </div>
                <span
                  className="tag"
                  style={reason.hot ? { color: 'var(--bad)', borderColor: 'var(--bad)' } : undefined}
                >
                  {reason.label}
                </span>
                {o.filled ? (
                  <span style={{ fontSize: 12.5 }}>
                    <b>{o.selectedCoach ?? 'Filled'}</b>
                    {o.finalPts > 0 && (
                      <span style={{ color: 'var(--ink-3)' }}>
                        {' '}
                        · {o.finalPts.toLocaleString('en-US')} pts
                      </span>
                    )}
                  </span>
                ) : (
                  <span style={{ fontSize: 11.5, color: 'var(--dev-elite)', fontWeight: 700 }}>OPEN</span>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="filters" style={{ marginTop: 16 }}>
        {(['HC', 'OC', 'DC', 'ALL'] as RoleFilter[]).map((r) => (
          <button key={r} className={`filter ${role === r ? 'active' : ''}`} onClick={() => setRole(r)}>
            {r}
          </button>
        ))}
        <span style={{ marginLeft: 'auto', alignSelf: 'center', display: 'inline-flex' }}>
          <InfoDot title="Coaching Carousel">
            <p>
              Job security for every head coach and coordinator in the country, read straight from
              each coach's record.
            </p>
            <InfoRow term="Flame">The game's own hot-seat designation.</InfoRow>
            <InfoRow term="Likely open">The sitting coach is on the hot seat.</InfoRow>
            <InfoRow term="At risk">
              Low security paired with an expiring deal or an impatient, reactionary AD.
            </InfoRow>
            <InfoRow term="Outlook">
              Every save fact feeding the forecast: seat status, security, contract, AD temperament.
            </InfoRow>
            <p>Open jobs list live once the season ends and the carousel starts turning.</p>
          </InfoDot>
        </span>
      </div>

      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              {th('Team', 'team')}
              {th('Coach', 'coach')}
              {th('Role', 'role')}
              {th('Age', 'age', { num: true })}
              {th('Rec', 'rec', { num: true, defaultAsc: false })}
              {th('Security', 'security')}
              {th('Seat', 'seat', { defaultAsc: false })}
              {th('Contract', 'contract')}
              {th('AD', 'ad')}
              {th('Outlook', 'outlook', { defaultAsc: false })}
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, BOARD_CAP).map(({ c, team, rec, reasons }) => (
              <tr
                key={`${c.teamRow}-${c.role}`}
                style={c.isUser ? { background: 'color-mix(in srgb, var(--team) 7%, transparent)' } : undefined}
              >
                <td>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                    <TeamLogo row={c.teamRow} size={20} fallback={null} />
                    <NameLink req={{ kind: 'school', row: c.teamRow }}>
                      {team?.longName ?? `Team ${c.teamRow}`}
                    </NameLink>
                  </span>
                </td>
                <td style={{ fontWeight: 600 }}>
                  <NameLink req={{ kind: 'coach', row: c.coachRow }}>{c.name}</NameLink>
                </td>
                <td>{c.role}</td>
                <td className="num">{c.age ?? '—'}</td>
                <td className="num">{rec ? `${rec.w}–${rec.l}` : '—'}</td>
                <td>
                  <SecurityCell pct={c.securityPct} status={c.securityStatus} />
                </td>
                <td>{c.securityStatus === 'HotSeat' ? <Flame /> : null}</td>
                <td>{c.contractLength > 0 ? `${c.yearsRemaining} of ${c.contractLength} yrs` : '—'}</td>
                <td style={{ color: 'var(--ink-3)' }}>{team?.adDemeanor ?? '—'}</td>
                <td>
                  <span style={{ display: 'inline-flex', gap: 4, flexWrap: 'wrap' }}>
                    {reasons.map((r) => (
                      <span
                        key={r}
                        className="tag"
                        style={r === 'HOT SEAT' ? { color: 'var(--bad)', borderColor: 'var(--bad)' } : undefined}
                      >
                        {r}
                      </span>
                    ))}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length > BOARD_CAP && (
        <p className="foot-note">
          Showing {BOARD_CAP} of {rows.length} {role === 'ALL' ? 'coaches' : `${role}s`} under the current
          sort.
        </p>
      )}
    </div>
  );
}
