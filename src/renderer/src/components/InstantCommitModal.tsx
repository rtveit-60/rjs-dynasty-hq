import { useEffect, useRef, useState } from 'react';
import type { RecruitTargetEntry } from '../../../shared/types.ts';
import { useDialog } from '../lib/dialog.ts';
import { stars } from '../lib/format.ts';
import { useHQ } from '../store.ts';
import InfoDot from './InfoDot.tsx';

/**
 * Confirmation step for Instant Commit. Nothing is written until the user
 * confirms; the write itself is the game's own instant-commit footprint
 * (hard commit, school list re-ranked, a scholarship if none is out) to the
 * <save>_RJ sibling.
 */
export default function InstantCommitModal({ target, onClose }: { target: RecruitTargetEntry; onClose: () => void }) {
  const school = useHQ((s) => s.snapshot?.school?.team.displayName ?? 'your program');
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

  const commit = async (): Promise<void> => {
    setState('writing');
    setError(null);
    try {
      const res = await window.hq.instantCommit({ recruitRow: target.recruitRow, label: target.name });
      if (res.ok) {
        setSavedNote(res.message);
        setState('saved');
        setTimeout(onClose, 2200);
      } else {
        setError(res.message);
        setState('ready');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setState('ready');
    }
  };

  const hasOffer = target.scholarship === 'Offered' || target.scholarship === 'New';

  return (
    <div className="ed-overlay" onMouseDown={onClose}>
      <div
        className="ed-panel ic-panel"
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Instant commit"
        tabIndex={-1}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="ed-head">
          <span className="ed-title">Instant Commit</span>
          <span className="ed-who">{school}</span>
          <InfoDot title="Instant commit">
            <p>
              Hard-commits the recruit to your program right now, the way the game records its own
              instant commits: the recruit's stage becomes Hard Committed, your school moves to the
              top of their list at their commit score, and if you have no scholarship out to them
              one is offered — that offer counts against the season's scholarship cap.
            </p>
            <p>
              Only open while the game's commitment window is active. Recruits already committed
              or signed elsewhere are left to the game.
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
              <span className="ic-name">{target.name}</span>
              <span className="ic-meta">
                <span className="pos-tag">{target.position}</span>
                <span className="ic-stars">{stars(target.stars)}</span>
              </span>
            </div>
            <p className="ic-copy">
              Commit <strong>{target.name}</strong> to <strong>{school}</strong> as a hard commit?
              {hasOffer
                ? ' Your scholarship offer already stands, so no new one is spent.'
                : ' A scholarship is offered as part of the commit and counts against your cap.'}
            </p>

            {error && <div className="ed-error" role="alert">{error}</div>}

            <div className="ed-foot">
              <span className="ed-target">Written to the …_RJ copy; the original save is never touched.</span>
              <button type="button" className="pf-btn" onClick={onClose}>
                Cancel
              </button>
              <button
                type="button"
                className="btn primary ed-save"
                disabled={state === 'writing'}
                onClick={() => void commit()}
              >
                {state === 'writing' ? 'WRITING…' : 'COMMIT TO PROGRAM'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
