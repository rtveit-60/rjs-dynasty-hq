import { useEffect, useMemo, useRef, useState } from 'react';
import { useDialog } from '../lib/dialog.ts';
import { stars } from '../lib/format.ts';
import { useHQ } from '../store.ts';
import InfoDot from './InfoDot.tsx';

export interface SwapCommitSubject {
  recruitRow: number;
  name: string;
  position: string;
  stars: number;
  /** School the recruit is committed to right now. */
  committedTo: string;
}

/**
 * Move a committed recruit's commitment to another school. Nothing is written
 * until the user confirms; the write re-leads the recruit's school list with
 * the chosen school and puts the recruit on that school's board with an offer
 * (RESEARCH "Swap commitment"), to the <save>_RJ sibling.
 */
export default function SwapCommitModal({ subject, onClose }: { subject: SwapCommitSubject; onClose: () => void }) {
  const teams = useHQ((s) => s.snapshot?.teams ?? []);
  const userRow = useHQ((s) => s.snapshot?.school?.team.row ?? null);
  const userName = useHQ((s) => s.snapshot?.school?.team.longName ?? null);

  const choices = useMemo(() => {
    const list = teams
      .filter((t) => t.longName !== subject.committedTo)
      .slice()
      .sort((a, b) => a.longName.localeCompare(b.longName));
    if (userRow !== null) {
      const i = list.findIndex((t) => t.row === userRow);
      if (i > 0) list.unshift(...list.splice(i, 1));
    }
    return list;
  }, [teams, subject.committedTo, userRow]);

  const [toRow, setToRow] = useState<number | null>(() => {
    const mine = userRow !== null && choices.some((t) => t.row === userRow) ? userRow : null;
    return mine ?? choices[0]?.row ?? null;
  });
  const [query, setQuery] = useState('');
  const [state, setState] = useState<'ready' | 'writing' | 'saved'>('ready');
  const [error, setError] = useState<string | null>(null);
  const [savedNote, setSavedNote] = useState('');

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

  const panelRef = useRef<HTMLDivElement>(null);
  useDialog(panelRef);

  const q = query.trim().toLowerCase();
  const shown = q
    ? choices.filter((t) => `${t.longName} ${t.nickName} ${t.shortName}`.toLowerCase().includes(q))
    : choices;
  const dest = choices.find((t) => t.row === toRow) ?? null;
  const toMine = dest !== null && dest.row === userRow;

  const swap = async (): Promise<void> => {
    if (!dest) return;
    setState('writing');
    setError(null);
    try {
      const res = await window.hq.swapCommit({ recruitRow: subject.recruitRow, toTeamRow: dest.row, label: subject.name });
      if (res.ok) {
        setSavedNote(res.message);
        setState('saved');
        setTimeout(onClose, 2400);
      } else {
        setError(res.message);
        setState('ready');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setState('ready');
    }
  };

  return (
    <div className="ed-overlay" onMouseDown={onClose}>
      <div
        className="ed-panel ic-panel sc-panel"
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Swap commitment"
        tabIndex={-1}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="ed-head">
          <span className="ed-title">Swap Commitment</span>
          <span className="ed-who">{subject.committedTo}</span>
          <InfoDot title="Swap commitment">
            <p>
              Moves a committed recruit's commitment to a school of your choosing. The save records a
              commitment as the recruit's stage plus the school at the top of their list, so the
              chosen school takes the top spot at the recruit's commit score (or the outgoing
              school's influence, whichever is higher) and the others shift down.
            </p>
            <p>
              The new school also has to be recruiting the player: if the recruit is not on that
              school's board, a fresh target is added, and if no scholarship is out to them one is
              offered. Moving a recruit to your program spends one of your scholarships when you
              have none out to them. Soft and hard commits both move as they are; signed recruits
              stay with the game.
            </p>
            <p>
              The change is written to a separate <strong>…_RJ</strong> copy of your save — the
              original is never modified — and the dashboard follows the copy.
            </p>
          </InfoDot>
          <button type="button" className="pf-btn ed-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        {state === 'saved' ? (
          <div className="ed-saved" role="status">{savedNote}</div>
        ) : (
          <>
            <div className="ic-who">
              <span className="ic-name">{subject.name}</span>
              <span className="ic-meta">
                <span className="pos-tag">{subject.position}</span>
                <span className="ic-stars">{stars(subject.stars)}</span>
              </span>
            </div>
            <p className="ic-copy">
              Committed to <strong>{subject.committedTo}</strong>. Pick the school the commitment moves to.
            </p>

            <div className="sc-pick">
              <input
                type="text"
                className="sc-search"
                placeholder="Find a school…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label="Find a school"
              />
              <select
                size={8}
                className="sc-list"
                value={toRow ?? ''}
                onChange={(e) => setToRow(Number(e.target.value))}
                aria-label="New school"
              >
                {shown.map((t) => (
                  <option key={t.row} value={t.row}>
                    {t.longName}
                    {t.row === userRow ? '  ·  your program' : ''}
                  </option>
                ))}
              </select>
            </div>

            {dest && (
              <p className="ic-copy">
                Move <strong>{subject.name}</strong> to <strong>{dest.longName}</strong>?
                {toMine
                  ? ' If you have no scholarship out to them, one is offered and counts against your cap.'
                  : ' The school gets the recruit on its board with an offer out if it had none.'}
              </p>
            )}

            {error && <div className="ed-error" role="alert">{error}</div>}

            <div className="ed-foot">
              <span className="ed-target">Written to the …_RJ copy; the original save is never touched.</span>
              <button type="button" className="pf-btn" onClick={onClose}>
                Cancel
              </button>
              <button
                type="button"
                className="btn primary ed-save"
                disabled={state === 'writing' || !dest}
                onClick={() => void swap()}
              >
                {state === 'writing' ? 'WRITING…' : toMine && userName ? 'MOVE TO MY PROGRAM' : 'MOVE COMMITMENT'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
