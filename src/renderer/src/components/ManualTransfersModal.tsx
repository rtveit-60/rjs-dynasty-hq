import { useEffect, useMemo, useRef, useState } from 'react';
import type { RosterPlayer, TeamInfo, TransferMove } from '../../../shared/types.ts';
import { useHQ } from '../store.ts';
import { useDialog } from '../lib/dialog.ts';
import { yearAbbrev } from '../lib/format.ts';
import InfoDot from './InfoDot.tsx';

/** The game's roster ceiling; the write re-checks it against the save's own RosterInfo. */
const ROSTER_CAP = 85;

type Side = 'left' | 'right';

/**
 * Manual Transfers: pick two schools, browse both rosters, and move rostered
 * players either way. Moves are staged here and written in one go through
 * the usual _RJsEdited path, mirroring the game's own sign-player steps.
 */
export default function ManualTransfersModal({ onClose }: { onClose: () => void }) {
  const snapshot = useHQ((s) => s.snapshot);
  const teams: TeamInfo[] = useMemo(
    () => [...(snapshot?.teams ?? [])].sort((a, b) => a.longName.localeCompare(b.longName)),
    [snapshot]
  );
  const homeRow = snapshot?.school?.team.row ?? teams[0]?.row ?? 0;
  const [leftRow, setLeftRow] = useState<number>(homeRow);
  const [rightRow, setRightRow] = useState<number>(teams.find((t) => t.row !== homeRow)?.row ?? homeRow);
  const [rosters, setRosters] = useState<Record<number, RosterPlayer[] | null>>({});
  const [moves, setMoves] = useState<Record<number, TransferMove>>({});
  const [state, setState] = useState<'ready' | 'writing' | 'saved'>('ready');
  const [error, setError] = useState<string | null>(null);
  const [savedMsg, setSavedMsg] = useState('');

  const panelRef = useRef<HTMLDivElement>(null);
  useDialog(panelRef);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (document.querySelector('.info-overlay')) return;
      e.stopPropagation();
      onClose();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  /** Rosters come from the cached parse: the scoped school directly, any other via browse. */
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    for (const row of [leftRow, rightRow]) {
      if (rosters[row] !== undefined) continue;
      if (snapshot?.school && snapshot.school.team.row === row) {
        setRosters((prev) => ({ ...prev, [row]: snapshot.school!.roster }));
        continue;
      }
      // null marks an in-flight read; the effect re-runs on that change and skips it.
      setRosters((prev) => ({ ...prev, [row]: null }));
      void window.hq
        .browseHQ(row)
        .then((school) => mounted.current && setRosters((prev) => ({ ...prev, [row]: school?.roster ?? [] })))
        .catch(() => mounted.current && setRosters((prev) => ({ ...prev, [row]: [] })));
    }
  }, [leftRow, rightRow, snapshot, rosters]);

  const pick = (side: Side, row: number): void => {
    setMoves({});
    setError(null);
    if (side === 'left') setLeftRow(row);
    else setRightRow(row);
  };

  const rowOf = (side: Side): number => (side === 'left' ? leftRow : rightRow);
  const other = (side: Side): Side => (side === 'left' ? 'right' : 'left');
  const teamName = (row: number): string => teams.find((t) => t.row === row)?.longName ?? `Row ${row}`;

  const sortRoster = (list: RosterPlayer[]): RosterPlayer[] =>
    [...list].sort((a, b) => a.position.localeCompare(b.position) || b.overall - a.overall);

  /** What each side shows: its own roster minus outgoing, plus incoming (marked). */
  const shown = (side: Side): { p: RosterPlayer; incoming: boolean }[] => {
    const row = rowOf(side);
    const own = (rosters[row] ?? []).filter((p) => !(moves[p.row] && moves[p.row].fromTeamRow === row));
    const inbound = (rosters[rowOf(other(side))] ?? []).filter((p) => moves[p.row]?.toTeamRow === row);
    return [...sortRoster(own).map((p) => ({ p, incoming: false })), ...sortRoster(inbound).map((p) => ({ p, incoming: true }))];
  };

  const count = (side: Side): number => shown(side).length;

  const stage = (side: Side, p: RosterPlayer): void => {
    setError(null);
    setMoves((prev) => {
      const next = { ...prev };
      if (next[p.row]) delete next[p.row];
      else next[p.row] = { playerRow: p.row, fromTeamRow: rowOf(side), toTeamRow: rowOf(other(side)) };
      return next;
    });
  };

  const moveList = Object.values(moves);
  const overCap = (['left', 'right'] as Side[]).filter((s) => count(s) > ROSTER_CAP);
  const problem =
    leftRow === rightRow
      ? 'Pick two different schools.'
      : overCap.length
        ? `${overCap.map((s) => teamName(rowOf(s))).join(' and ')} would exceed the ${ROSTER_CAP}-man limit.`
        : null;

  const save = async (): Promise<void> => {
    if (!moveList.length || problem) return;
    setState('writing');
    setError(null);
    try {
      const res = await window.hq.transferPlayers({ moves: moveList });
      if (res.ok) {
        setSavedMsg(res.message);
        setState('saved');
        setTimeout(onClose, 2600);
      } else {
        setError(res.message);
        setState('ready');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setState('ready');
    }
  };

  const column = (side: Side) => {
    const row = rowOf(side);
    const list = rosters[row];
    const n = count(side);
    return (
      <div className="mt-col">
        <div className="mt-head">
          <select value={row} onChange={(e) => pick(side, Number(e.target.value))} aria-label={`${side} school`}>
            {teams.map((t) => (
              <option key={t.row} value={t.row}>
                {t.longName}
              </option>
            ))}
          </select>
          <span className={`mt-count ${n > ROSTER_CAP ? 'over' : ''}`}>
            {list ? n : '…'}/{ROSTER_CAP}
          </span>
        </div>
        {list === null || list === undefined ? (
          <div className="pf-wait">Reading the roster…</div>
        ) : (
          <div className="mt-list" role="list">
            {shown(side).map(({ p, incoming }) => (
              <button
                key={p.row}
                type="button"
                role="listitem"
                className={`mt-row ${incoming ? 'in' : ''} ${moves[p.row] ? 'staged' : ''}`}
                onClick={() => stage(incoming ? other(side) : side, p)}
                title={incoming ? 'Incoming — click to cancel' : `Move to ${teamName(rowOf(other(side)))}`}
              >
                <span className="mt-pos">{p.position}</span>
                <span className="mt-name">
                  {p.firstName} {p.lastName}
                </span>
                <span className="mt-yr">{yearAbbrev(p.schoolYear, p.redshirt)}</span>
                <span className="mt-ovr">{p.overall}</span>
                <span className="mt-arrow" aria-hidden="true">
                  {incoming ? '↩' : side === 'left' ? '→' : '←'}
                </span>
              </button>
            ))}
            {!shown(side).length && <div className="cr-note">No players.</div>}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="ed-overlay" onMouseDown={onClose}>
      <div
        className="ed-panel ed-panel-wide mt-panel"
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Manual transfers"
        tabIndex={-1}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="ed-head">
          <span className="ed-title">Manual Transfers</span>
          <span className="ed-who">Click a player to send him across; click an incoming player to cancel.</span>
          <InfoDot title="Manual transfers">
            <p>
              Moves are written the way the game itself signs a player: off the old roster list and depth
              chart, onto the new roster list, previous school recorded, years-with-team reset, and both
              schools' active-roster counters adjusted. The new school's depth chart is left for the game to
              refill on load.
            </p>
            <p>
              Only rostered players move (prospects and portal players stay where they are). Neither school
              can end above the game's {ROSTER_CAP}-man limit. Team Needs update with the next refresh. As with
              every edit, the write lands in the <strong>…_RJsEdited</strong> copy; the original save is never
              touched.
            </p>
          </InfoDot>
          <button type="button" className="pf-btn ed-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        {state === 'saved' ? (
          <div className="ed-saved" role="status">
            <div className="ed-saved-name">{savedMsg}</div>
            Saved. The dashboard now follows the edited copy.
          </div>
        ) : (
          <>
            <div className="mt-grid">
              {column('left')}
              {column('right')}
            </div>
            {moveList.length > 0 && (
              <div className="mt-staged">
                {moveList.length} staged: {moveList.map((m) => {
                  const p = [...(rosters[m.fromTeamRow] ?? [])].find((x) => x.row === m.playerRow);
                  return p ? `${p.firstName} ${p.lastName} → ${teamName(m.toTeamRow)}` : '';
                }).filter(Boolean).join(' · ')}
              </div>
            )}
            {(error || problem) && <div className="ed-error" role="alert">{error ?? problem}</div>}
            <div className="ed-foot">
              <span className="ed-target">
                Writes the <strong>…_RJsEdited</strong> copy — the original save is never touched.
              </span>
              <button type="button" className="pf-btn" onClick={onClose}>
                Cancel
              </button>
              <button
                type="button"
                className="btn primary ed-save"
                disabled={!moveList.length || !!problem || state === 'writing'}
                onClick={() => void save()}
              >
                {state === 'writing' ? 'WRITING…' : `SAVE ${moveList.length || ''} TRANSFER${moveList.length === 1 ? '' : 'S'}`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
