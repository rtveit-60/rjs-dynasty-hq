import { useEffect, useState } from 'react';
import type { RivalrySeries, Snapshot } from '../../../shared/types.ts';
import { assetSlug, probeArt, useArt } from '../lib/art-probe.ts';
import { NameLink } from './ProfileModal.tsx';
import TeamLogo from './TeamLogo.tsx';
import { AWARD_NAMES } from '../../../shared/awards.ts';

type School = NonNullable<Snapshot['school']>;

const awardLabel = (t: string) =>
  AWARD_NAMES[t] ??
  t
    .toLowerCase()
    .split('_')
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ');

const trophyUrl = (r: RivalrySeries) =>
  r.assetName ? `gameicon://trophy-${assetSlug(r.assetName)}` : null;

/**
 * One shelf spot in the trophy case: the real trophy render (extracted from
 * the user's install by `node scripts/extract-rivalry-art.ts`) over the
 * series line. Renders nothing when the art isn't on this machine.
 */
function TrophyCard({ r, school }: { r: RivalrySeries; school: School }) {
  const url = trophyUrl(r);
  const ok = useArt(url);
  if (!ok || !url) return null;
  const held = r.usWins > r.themWins || (r.usWins === r.themWins && r.streakOurs === true);
  return (
    <div className={`th-trophy${held ? ' held' : ''}`} title={`${r.name} — vs ${r.rivalName}`}>
      <img src={url} alt={r.secondaryName || r.name} loading="lazy" />
      <div className="th-trophy-name">
        {r.secondaryName || r.name}
        <span className="sr-only"> vs {r.rivalName}</span>
      </div>
      <div className={`th-trophy-rec${held ? ' good' : ''}`}>
        {r.usWins}–{r.themWins}
        {r.streakOurs !== null && r.streakLength > 0 && (
          <span className="stk">
            {' '}
            · {r.streakOurs ? 'W' : 'L'}
            {r.streakLength}
          </span>
        )}
      </div>
    </div>
  );
}

/** Small ledger-row trophy mark; absent art collapses to nothing. */
function TrophyThumb({ r }: { r: RivalrySeries }) {
  const url = trophyUrl(r);
  const ok = useArt(url);
  if (!ok || !url) return null;
  return <img className="th-thumb" src={url} alt="" loading="lazy" />;
}

/**
 * The trophy case: every rivalry trophy the game actually models for this
 * program's series, extracted per machine. Hidden entirely until at least one
 * render is on disk.
 */
function TrophyShelf({ rivalries, school }: { rivalries: RivalrySeries[]; school: School }) {
  const [ready, setReady] = useState<RivalrySeries[]>([]);
  const probeKey = rivalries.map((r) => r.assetName).join('|');
  useEffect(() => {
    let alive = true;
    void Promise.all(
      rivalries.map(async (r) => {
        const url = trophyUrl(r);
        return url && (await probeArt(url)) ? r : null;
      })
    ).then((rs) => alive && setReady(rs.filter((x): x is RivalrySeries => x !== null)));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [probeKey]);
  if (!ready.length) return null;
  return (
    <div className="panel" style={{ marginTop: 12 }}>
      <div className="panel-title">Trophy Case</div>
      <div className="th-shelf">
        {ready.map((r) => (
          <TrophyCard key={r.assetName} r={r} school={school} />
        ))}
      </div>
    </div>
  );
}

export default function TeamHistoryView({ school }: { school: School }) {
  const h = school.history;
  if (!h || (!h.rivalries.length && !h.honors.length && !h.heisman.length)) {
    return <div className="empty">No program history found in this save.</div>;
  }

  const seriesWins = h.rivalries.reduce((s, r) => s + r.usWins, 0);
  const seriesLosses = h.rivalries.reduce((s, r) => s + r.themWins, 0);
  const seriesLed = h.rivalries.filter((r) => r.usWins > r.themWins).length;
  const honorYears = [...new Set(h.honors.map((x) => x.year))].sort((a, b) => b - a);
  const ourHeismans = h.heisman.filter((w) => w.school === (school.team.longName || school.team.displayName));

  return (
    <>
      <div className="statgrid" style={{ marginTop: 16 }}>
        <div className="stat">
          <div className="lbl">Rivalry Series</div>
          <div className="num">{h.rivalries.length}</div>
          <div className="sub">
            leading {seriesLed} of {h.rivalries.length}
          </div>
        </div>
        <div className="stat">
          <div className="lbl">All-Time vs Rivals</div>
          <div className="num">
            {seriesWins}–{seriesLosses}
          </div>
          <div className="sub">every meeting on record</div>
        </div>
        <div className="stat">
          <div className="lbl">National Honors</div>
          <div className="num">{h.honors.length}</div>
          <div className="sub">{honorYears.length ? `across ${honorYears.length} seasons` : 'none yet'}</div>
        </div>
        <div className="stat">
          <div className="lbl">Heismans</div>
          <div className="num">{ourHeismans.length}</div>
          <div className="sub">
            {ourHeismans.length ? ourHeismans.map((w) => `’${String(w.year).slice(2)}`).join(' · ') : 'still chasing'}
          </div>
        </div>
      </div>

      <TrophyShelf rivalries={h.rivalries} school={school} />

      <div className="two-col" style={{ marginTop: 12 }}>
        <div className="panel">
          <div className="panel-title">Rivalry Ledger</div>
          {h.rivalries.length === 0 && <div className="empty">No rivalry series involve this program.</div>}
          {h.rivalries.map((r) => {
            const lead = r.usWins > r.themWins ? 'lead' : r.usWins < r.themWins ? 'trail' : 'even in';
            return (
              <div
                key={`${r.name}-${r.rivalRow}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '7px 0',
                  borderBottom: '1px solid var(--line-soft)'
                }}
              >
                <TeamLogo row={r.rivalRow} size={26} fallback={null} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>
                    <NameLink req={{ kind: 'school', row: r.rivalRow }}>{r.rivalName}</NameLink>
                    <TrophyThumb r={r} />
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--ink-3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {r.name}
                    {r.secondaryName ? ` · ${r.secondaryName}` : ''}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 15 }}>
                    {r.usWins}–{r.themWins}
                  </div>
                  <div style={{ fontSize: 10.5, color: 'var(--ink-3)' }}>we {lead} the series</div>
                </div>
                <div style={{ width: 74, textAlign: 'right' }}>
                  {r.streakOurs !== null && r.streakLength > 0 && (
                    <div
                      style={{
                        fontSize: 11.5,
                        fontWeight: 700,
                        color: r.streakOurs ? 'var(--good)' : 'var(--bad)'
                      }}
                    >
                      {r.streakOurs ? 'W' : 'L'}
                      {r.streakLength} streak
                    </div>
                  )}
                  {(r.lastScoreUs > 0 || r.lastScoreThem > 0) && (
                    <div style={{ fontSize: 10.5, color: 'var(--ink-3)' }}>
                      last {r.lastScoreUs}–{r.lastScoreThem}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="panel">
          <div className="panel-title">Program Honors</div>
          {h.honors.length === 0 && (
            <div className="empty">No national season awards on this program's shelf yet.</div>
          )}
          {honorYears.map((year) => (
            <div key={year} style={{ marginBottom: 8 }}>
              <div
                style={{
                  fontSize: 11,
                  letterSpacing: '0.1em',
                  color: 'var(--ink-3)',
                  borderBottom: '1px solid var(--line-soft)',
                  paddingBottom: 2,
                  marginBottom: 4
                }}
              >
                {year}
              </div>
              {h.honors
                .filter((x) => x.year === year)
                .map((x, i) => (
                  <div key={`${x.awardType}-${i}`} style={{ display: 'flex', gap: 8, fontSize: 12.5, lineHeight: 1.8 }}>
                    <span style={{ flex: 1 }}>{awardLabel(x.awardType)}</span>
                    <b>{x.recipient}</b>
                    {x.position && <span style={{ color: 'var(--ink-3)', width: 28, textAlign: 'right' }}>{x.position}</span>}
                  </div>
                ))}
            </div>
          ))}
        </div>
      </div>

      {h.heisman.length > 0 && (
        <div className="panel" style={{ marginTop: 12 }}>
          <div className="panel-title">Heisman Line</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: '4px 16px' }}>
            {h.heisman.map((w) => {
              const ours = w.school === (school.team.longName || school.team.displayName);
              return (
                <div key={`${w.year}-${w.name}`} style={{ display: 'flex', gap: 8, fontSize: 12.5, lineHeight: 1.9 }}>
                  <span style={{ color: 'var(--ink-3)', width: 36 }}>{w.year}</span>
                  <b style={{ color: ours ? 'var(--team-bright, var(--ink))' : 'var(--ink)' }}>{w.name}</b>
                  <span style={{ color: 'var(--ink-3)', flex: 1, textAlign: 'right' }}>{w.school}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}
