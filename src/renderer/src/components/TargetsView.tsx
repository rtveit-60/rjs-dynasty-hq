import { Fragment, useMemo, useState } from 'react';
import type { RecruitTargetEntry, Snapshot } from '../../../shared/types.ts';
import { STAGE_LABELS, spaceOut, stars } from '../lib/format.ts';
import { useHQ } from '../store.ts';
import InfoDot, { InfoRow } from './InfoDot.tsx';
import { NameLink } from './ProfileModal.tsx';
import RecruitCardRow from './RecruitCardRow.tsx';
import BoardSaveBar, { BoardToggle } from './BoardSaveBar.tsx';
import ResourceModal from './ResourceModal.tsx';
import TeamNeedsStrip from './TeamNeedsStrip.tsx';

type School = NonNullable<Snapshot['school']>;

type SortKey =
  | 'name'
  | 'pos'
  | 'stars'
  | 'gem'
  | 'status'
  | 'visit'
  | 'nil'
  | 'standing'
  | 'natl'
  | 'posrk'
  | 'deal';

const GEM_ORDER: Record<string, number> = { BUST: 0, NORMAL: 1, GEM: 2 };
const STAGE_ORDER: Record<string, number> = {
  Top10: 0,
  Top5: 1,
  Top3: 2,
  Battle: 3,
  SoftCommitted: 4,
  HardCommitted: 5
};
const BIG = Number.MAX_SAFE_INTEGER;

const standingOf = (t: RecruitTargetEntry): number => {
  const i = t.pursuing.findIndex((s) => s.isUser);
  return i >= 0 ? i + 1 : BIG;
};

/**
 * The snap pool a recruit is really competing for — sides collapse (LT/RT),
 * linebacker roles stay apart (a MIKE and a WILL both start).
 */
const ROLE_POOL: Record<string, string> = {
  QB: 'QB',
  HB: 'HB', FB: 'FB',
  WR: 'WR', TE: 'TE',
  LT: 'OT', RT: 'OT', LG: 'OG', RG: 'OG', C: 'C',
  LE: 'EDGE', RE: 'EDGE', DT: 'DT', NT: 'DT',
  MLB: 'MIKE', ROLB: 'SAM', LOLB: 'WILL',
  CB: 'CB', FS: 'S', SS: 'S',
  K: 'K', P: 'P', LS: 'LS'
};

const rating = (t: RecruitTargetEntry): number => t.stars * 10000 - (t.nationalRank || 9999) / 1;

/**
 * Two or more targets who both demand playing time in the same snap pool
 * can't all get it. Maps target key → the other names in the collision.
 */
function playingTimeConflicts(targets: RecruitTargetEntry[]): Map<RecruitTargetEntry, string[]> {
  const pools = new Map<string, RecruitTargetEntry[]>();
  for (const t of targets) {
    if (t.dealbreaker !== 'PlayingTime') continue;
    const pool = ROLE_POOL[t.position] ?? t.position;
    pools.set(pool, [...(pools.get(pool) ?? []), t]);
  }
  const out = new Map<RecruitTargetEntry, string[]>();
  for (const list of pools.values()) {
    if (list.length < 2) continue;
    const sorted = [...list].sort((a, b) => rating(b) - rating(a));
    for (const t of sorted) {
      out.set(t, sorted.filter((o) => o !== t).map((o) => o.name));
    }
  }
  return out;
}

const DEAL_LABELS: Record<string, string> = {
  PlayingTime: 'Playing Time',
  ProximityToHome: 'Close to Home',
  ChampionshipContender: 'Contender',
  BrandExposure: 'Brand Exposure',
  PlayingStyle: 'Playing Style',
  CoachPrestige: 'Coach Prestige',
  ProPotential: 'Pro Potential',
  ConferencePrestige: 'Conf. Prestige'
};

export default function TargetsView({ school, browsing = false }: { school: School; browsing?: boolean }) {
  const board = school.board;
  const currentWeek = useHQ((s) => s.snapshot?.season?.week ?? 0);
  const [sortKey, setSortKey] = useState<SortKey>('stars');
  const [asc, setAsc] = useState(false);
  const [openRow, setOpenRow] = useState<number | null>(null);
  const [hiring, setHiring] = useState(false);

  const conflicts = useMemo(
    () => playingTimeConflicts(board?.targets ?? []),
    [board]
  );

  const sorted = useMemo(() => {
    if (!board) return [];
    const dir = asc ? 1 : -1;
    const list = [...board.targets];
    list.sort((a, b) => {
      switch (sortKey) {
        case 'name':
          return dir * a.name.localeCompare(b.name);
        case 'pos':
          return dir * a.position.localeCompare(b.position) || b.stars - a.stars;
        case 'gem':
          return dir * ((GEM_ORDER[a.quality] ?? 1) - (GEM_ORDER[b.quality] ?? 1)) || b.stars - a.stars;
        case 'status':
          return (
            dir * ((STAGE_ORDER[a.stage] ?? 9) - (STAGE_ORDER[b.stage] ?? 9)) || b.influence - a.influence
          );
        case 'visit':
          return dir * ((a.visitWeek ?? BIG) - (b.visitWeek ?? BIG)) || b.stars - a.stars;
        case 'nil':
          return dir * (a.nilOffer - b.nilOffer) || b.stars - a.stars;
        case 'standing':
          return dir * (standingOf(a) - standingOf(b)) || b.influence - a.influence;
        case 'natl':
          return dir * ((a.nationalRank || BIG) - (b.nationalRank || BIG));
        case 'posrk':
          return dir * ((a.positionRank || BIG) - (b.positionRank || BIG));
        case 'deal':
          return (
            dir * ((conflicts.has(b) ? 1 : 0) - (conflicts.has(a) ? 1 : 0)) ||
            a.dealbreaker.localeCompare(b.dealbreaker) ||
            b.stars - a.stars
          );
        default:
          return dir * (a.stars - b.stars) || b.influence - a.influence;
      }
    });
    return list;
  }, [board, sortKey, asc, conflicts]);

  if (!board || !board.targets.length) {
    return (
      <>
        <TeamNeedsStrip needs={school.teamNeeds} />
        <div className="empty">No recruiting board found in this save.</div>
      </>
    );
  }
  const gems = board.targets.filter((t) => t.quality === 'GEM').length;
  const busts = board.targets.filter((t) => t.quality === 'BUST').length;
  const committed = board.targets.filter((t) => t.stage.includes('Committed')).length;

  const sortBy = (key: SortKey, defaultAsc = false) => {
    if (sortKey === key) setAsc(!asc);
    else {
      setSortKey(key);
      setAsc(defaultAsc);
    }
  };

  const th = (label: string, key: SortKey, opts?: { num?: boolean; defaultAsc?: boolean }) => (
    <th
      className={`${opts?.num ? 'num ' : ''}${sortKey === key ? 'sorted' : ''}`}
      onClick={() => sortBy(key, opts?.defaultAsc ?? false)}
    >
      {label}
      {sortKey === key ? (asc ? ' ↑' : ' ↓') : ''}
    </th>
  );

  const statusCell = (t: RecruitTargetEntry) => (
    <span className={t.stage.includes('Committed') ? 'commit' : ''}>
      {STAGE_LABELS[t.stage] ?? t.stage}
    </span>
  );

  const dealCell = (t: RecruitTargetEntry) => {
    if (!t.dealbreaker) return <span style={{ color: 'var(--ink-3)' }}>—</span>;
    const rivals = conflicts.get(t);
    const label = DEAL_LABELS[t.dealbreaker] ?? spaceOut(t.dealbreaker);
    if (!rivals) return <span className="deal">{label}</span>;
    return (
      <span
        className="deal clash"
        title={`Also chasing ${rivals.join(', ')} — everyone here wants playing time at the same spot.`}
      >
        <span className="dot" /> {label}
      </span>
    );
  };

  return (
    <>
      <TeamNeedsStrip needs={school.teamNeeds} />

      <div className="filters" style={{ alignItems: 'center' }}>
        <span className="chip">
          <span className="k">BOARD</span> <b>{board.targets.length}</b>
        </span>
        <span className="chip">
          <span className="k">HOURS</span>{' '}
          <b>
            {board.hoursAssigned}/{board.hoursTotal}
          </b>
        </span>
        {hiring && !browsing && <ResourceModal kind="hours" onClose={() => setHiring(false)} />}
        <span className="chip">
          <span className="k">COMMITS</span> <b>{committed}</b>
        </span>
        <span className="chip">
          <span className="k">GEMS</span> <b>{gems}</b>
        </span>
        <span className="chip">
          <span className="k">BUSTS</span> <b>{busts}</b>
        </span>
        {!browsing && (
          <button
            type="button"
            className="filter"
            style={{ marginLeft: 'auto' }}
            onClick={() => setHiring(true)}
            title="Add weekly recruiting hours (writes a _RJsEdited copy)"
          >
            Hire Scouts
          </button>
        )}
        <InfoDot title="Recruiting Office">
          <p>Your board, with everything the game knows about each pursuit.</p>
          <InfoRow term="Standing">
            Your rank among the schools chasing the recruit; hover for raw influence. The full race
            is in the profile.
          </InfoRow>
          <InfoRow term="Visit">
            Scheduled visit week. Green is upcoming; hover shows the planned activity.
          </InfoRow>
          <InfoRow term="NIL">
            Your offer. A ▾ marks an offer sitting under the recruit's expectation; hover for the
            number.
          </InfoRow>
          <InfoRow term="Dealbreaker">
            What the recruit will not budge on. A tinted dot flags two of your own targets demanding
            playing time at the same spot; hover names the rivals.
          </InfoRow>
          <InfoRow term="♥">Board favorite.</InfoRow>
          <p>
            Click a row for At a Glance: the position's key skills, abilities, motivations and the
            ideal pitch. Click a name for the full profile.
          </p>
        </InfoDot>
      </div>

      {!browsing && <BoardSaveBar />}
      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              {th('Recruit', 'name', { defaultAsc: true })}
              {th('Pos', 'pos', { defaultAsc: true })}
              {th('Rating', 'stars')}
              {th('Gem', 'gem')}
              {th('Status', 'status')}
              {th('Visit', 'visit', { defaultAsc: true })}
              {th('NIL', 'nil', { num: true })}
              {th('Standing', 'standing', { num: true, defaultAsc: true })}
              {th('Natl', 'natl', { num: true, defaultAsc: true })}
              {th('Pos Rk', 'posrk', { num: true, defaultAsc: true })}
              {th('Dealbreaker', 'deal')}
            </tr>
          </thead>
          <tbody>
            {sorted.map((t) => (
              <Fragment key={t.playerRow}>
              <tr
                onClick={() => setOpenRow(openRow === t.playerRow ? null : t.playerRow)}
                className={`clickable ${openRow === t.playerRow ? 'expanded' : ''}`}
              >
                <td className="pname">
                  <span className="disclose">{openRow === t.playerRow ? '▾' : '▸'}</span>
                  {t.isFavorite && <span className="fav">♥ </span>}
                  <NameLink req={{ kind: 'player', row: t.playerRow }}>{t.name}</NameLink>
                  <span style={{ color: 'var(--ink-3)', fontWeight: 400 }}> · {spaceOut(t.homeState)}</span>
                  {!browsing && !t.stage.includes('Committed') && (
                    <BoardToggle recruitRow={t.recruitRow} onBoard={true} />
                  )}
                </td>
                <td>
                  <span className="pos-tag">{t.position}</span>
                </td>
                <td>
                  <span className="stars-cell" title={`${t.stars} stars`}>
                    {stars(t.stars).slice(0, t.stars)}
                    <span className="off">{stars(t.stars).slice(t.stars)}</span>
                  </span>
                </td>
                <td>
                  {t.quality === 'GEM' && <span className="q gem">GEM</span>}
                  {t.quality === 'BUST' && <span className="q bust">BUST</span>}
                  {t.quality !== 'GEM' && t.quality !== 'BUST' && '—'}
                </td>
                <td>{statusCell(t)}</td>
                <td title={t.visitActivity ? spaceOut(t.visitActivity) : undefined}>
                  {t.visitWeek !== null ? (
                    <span className={t.visitWeek >= currentWeek ? 'visit-yes' : undefined}>
                      Wk {t.visitWeek}
                    </span>
                  ) : (
                    '—'
                  )}
                </td>
                <td className="num" title={`Expects ${t.nilExpectation}`}>
                  {t.nilOffer > 0 ? t.nilOffer : '—'}
                  {t.nilOffer > 0 && t.nilOffer < t.nilExpectation && (
                    <span style={{ color: 'var(--warn)' }}> ▾</span>
                  )}
                </td>
                <td className="num" title={`Influence ${t.influence}`}>
                  {standingOf(t) === BIG ? '—' : <b>#{standingOf(t)}</b>}
                </td>
                <td className="num">{t.nationalRank > 0 ? t.nationalRank : '—'}</td>
                <td className="num">{t.positionRank > 0 ? t.positionRank : '—'}</td>
                <td>{dealCell(t)}</td>
              </tr>
              {/* Same At a Glance card as the Recruiting board; 11 columns above. */}
              {openRow === t.playerRow && <RecruitCardRow playerRow={t.playerRow} span={11} />}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
