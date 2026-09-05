import { useEffect, useRef, useState } from 'react';
import type { MassCommitForm, MassCommitSkipReason } from '../../../shared/types.ts';
import { useDialog } from '../lib/dialog.ts';
import InfoDot from './InfoDot.tsx';

const SKIP_LABELS: Record<MassCommitSkipReason, string> = {
  alreadyHere: 'already committed to you',
  elsewhere: 'committed to another school',
  noList: 'no school list in the save',
  signed: 'already signed',
  cap: 'no scholarship left under the cap'
};

/**
 * Recruiting Class Options — board-wide actions on the recruiting class.
 * First option: Mass Commit, which hard-commits every eligible target on the
 * board in one write (each on the game's own instant-commit footprint; with
 * the flip switch, targets committed elsewhere come along on the swap
 * footprint). Nothing is written until the user confirms.
 */
export default function ClassOptionsModal({ onClose }: { onClose: () => void }) {
  const [form, setForm] = useState<MassCommitForm | null | 'loading'>('loading');
  const [flip, setFlip] = useState(false);
  const [state, setState] = useState<'ready' | 'writing' | 'saved'>('ready');
  const [error, setError] = useState<string | null>(null);
  const [savedNote, setSavedNote] = useState('');

  useEffect(() => {
    let live = true;
    void window.hq.getMassCommitForm().then((f) => {
      if (live) setForm(f);
    });
    return () => {
      live = false;
    };
  }, []);

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

  const plan = form && form !== 'loading' ? (flip ? form.withFlips : form.boardOnly) : null;
  const canCommit = !!plan && plan.commits > 0 && form !== 'loading' && form !== null && form.windowOpen;

  const commit = async (): Promise<void> => {
    setState('writing');
    setError(null);
    try {
      const res = await window.hq.massCommit({ flipOthers: flip });
      if (res.ok) {
        setSavedNote(res.message);
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

  const skippedShown = plan ? plan.skipped.filter((s) => s.reason !== 'alreadyHere') : [];
  const alreadyHere = plan ? plan.skipped.filter((s) => s.reason === 'alreadyHere').length : 0;

  return (
    <div className="ed-overlay" onMouseDown={onClose}>
      <div
        className="ed-panel ic-panel co-panel"
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Recruiting class options"
        tabIndex={-1}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="ed-head">
          <span className="ed-title">Recruiting Class Options</span>
          <span className="ed-who">{form && form !== 'loading' ? form.school : ''}</span>
          <InfoDot title="Recruiting class options">
            <p>
              Board-wide actions on your recruiting class. <strong>Mass Commit</strong> hard-commits
              every uncommitted target on your board at once, each the way the game records its own
              instant commits: stage Hard Committed, your school on top of their list at their commit
              score, and a scholarship offered where you had none out. Each new offer counts against
              the season's cap, so targets past the cap are left out and listed here.
            </p>
            <p>
              With the flip switch on, targets already committed to other schools come along too:
              your school takes the top of their list (at their commit score or the old leader's
              influence, whichever is higher) and their stage becomes Hard Committed. Signed recruits
              stay with the game. Only open while the game's commitment window is active.
            </p>
            <p>
              Everything is written in one pass to a separate <strong>…_RJ</strong> copy of your
              save — the original is never modified — and the dashboard follows the copy.
            </p>
          </InfoDot>
          <button type="button" className="pf-btn ed-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        {state === 'saved' ? (
          <div className="ed-saved" role="status">{savedNote}</div>
        ) : form === 'loading' ? (
          <p className="ic-copy">Reading the board…</p>
        ) : form === null ? (
          <p className="ic-copy">The board could not be read from this save.</p>
        ) : (
          <>
            <div className="co-facts">
              <span className="chip">
                <span className="k">BOARD</span> <b>{form.boardCount}</b>
              </span>
              <span className="chip">
                <span className="k">SCHOLARSHIPS</span>{' '}
                <b>
                  {form.scholarshipsUsed}/{form.scholarshipsCap}
                </b>
              </span>
              <span className={`chip ${form.windowOpen ? '' : 'co-closed'}`}>
                <span className="k">COMMIT WINDOW</span> <b>{form.windowOpen ? 'OPEN' : 'CLOSED'}</b>
              </span>
            </div>

            <div className="ed-sec">Mass Commit</div>
            <p className="ic-copy">
              Hard-commit every uncommitted target on your board to <strong>{form.school}</strong> in one
              write.
            </p>
            <label className="ta-check co-flip">
              <input type="checkbox" checked={flip} onChange={(e) => setFlip(e.target.checked)} />
              <span>Also flip targets committed to other schools</span>
            </label>

            {plan && (
              <div className="co-plan">
                <div className="co-plan-row">
                  <span className="k">WILL COMMIT</span>
                  <b>{plan.commits}</b>
                  {plan.flips > 0 && <em>{plan.flips} flipped</em>}
                </div>
                <div className="co-plan-row">
                  <span className="k">SCHOLARSHIPS SPENT</span>
                  <b>{plan.newOffers}</b>
                  <em>
                    {form.scholarshipsUsed + plan.newOffers}/{form.scholarshipsCap} after
                  </em>
                </div>
                {alreadyHere > 0 && (
                  <div className="co-plan-row">
                    <span className="k">ALREADY YOURS</span>
                    <b>{alreadyHere}</b>
                  </div>
                )}
                {skippedShown.length > 0 && (
                  <div className="co-skipped">
                    <span className="k">LEFT OUT</span>
                    <ul>
                      {skippedShown.map((s, i) => (
                        <li key={`${s.name}-${i}`}>
                          <span className="co-skip-name">{s.name}</span>
                          <span className="co-skip-why">{SKIP_LABELS[s.reason]}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {!form.windowOpen && (
              <div className="ed-error" role="alert">
                The game's commitment window is closed right now — recruits can commit once it reopens.
              </div>
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
                disabled={state === 'writing' || !canCommit}
                onClick={() => void commit()}
              >
                {state === 'writing' ? 'WRITING…' : `COMMIT ${plan?.commits ?? 0} RECRUIT${plan?.commits === 1 ? '' : 'S'}`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
