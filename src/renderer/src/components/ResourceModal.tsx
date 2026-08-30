import { useEffect, useState } from 'react';
import type { ResourceForm } from '../../../shared/types.ts';
import InfoDot from './InfoDot.tsx';

const NIL_STEPS = [10, 50, 100, 500, 1000];
const HOUR_STEPS = [10, 50, 100, 1000];

/**
 * Fundraising (program points, the pool NIL offers spend from) and Hire
 * Additional Recruiters (weekly recruiting hours). Both add to the user
 * school and write the <save>_RJsEdited sibling — the original is never
 * touched — through the same guarded path as player edits.
 */
export default function ResourceModal({
  kind,
  onClose
}: {
  kind: 'nil' | 'hours';
  onClose: () => void;
}) {
  const [form, setForm] = useState<ResourceForm | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'missing' | 'writing' | 'saved'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [savedNote, setSavedNote] = useState('');
  const [amount, setAmount] = useState(0);

  const isNil = kind === 'nil';
  const title = isNil ? 'Fundraising' : 'Hire Scouts';
  const unit = isNil ? 'points' : 'hours';
  const steps = isNil ? NIL_STEPS : HOUR_STEPS;

  useEffect(() => {
    let alive = true;
    void window.hq
      .getResourceForm()
      .then((f) => {
        if (!alive) return;
        if (!f || (kind === 'hours' && !f.hours)) {
          setState('missing');
          return;
        }
        setForm(f);
        setState('ready');
      })
      .catch(() => alive && setState('missing'));
    return () => {
      alive = false;
    };
  }, [kind]);

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

  const headroom = form ? (isNil ? form.budget.headroom : (form.hours?.headroom ?? 0)) : 0;
  const current = form ? (isNil ? form.budget.total : (form.hours?.total ?? 0)) : 0;
  const applied = Math.min(amount, headroom);
  const clamped = amount > 0 && applied < amount;

  const save = async (): Promise<void> => {
    if (!form || applied <= 0) return;
    setState('writing');
    setError(null);
    try {
      const res = await window.hq.editResource({ kind, amount });
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

  return (
    <div className="ed-overlay" onMouseDown={onClose}>
      <div className="ed-panel rs-panel" onMouseDown={(e) => e.stopPropagation()}>
        <div className="ed-head">
          <span className="ed-title">{title}</span>
          {form && <span className="ed-who">{form.school}</span>}
          <InfoDot title={title}>
            {isNil ? (
              <p>
                Adds program points — the season pool your NIL offers, staff and facilities
                spending all draw from — to this school's budget, booked as extra rollover
                income so the ledger keeps adding up. The save format caps the pool at the
                schema's limits; the dialog clamps to whatever headroom remains.
              </p>
            ) : (
              <p>
                Adds weekly recruiting hours to the school's total. The save format stores
                hours in a capped field (4,095 at most), so the dialog clamps to the headroom
                that remains.
              </p>
            )}
            <p>
              The change is written to a separate <strong>…_RJsEdited</strong> copy of your
              save — the original is never modified — and the dashboard follows the copy.
              Load it in the game to play with the change.
            </p>
          </InfoDot>
          <button type="button" className="pf-btn ed-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        {state === 'loading' && <div className="pf-wait">Reading the save…</div>}
        {state === 'missing' && (
          <div className="pf-wait">
            {kind === 'hours'
              ? 'No recruiting board in this save yet.'
              : 'Nothing readable in the save for this one.'}
          </div>
        )}
        {state === 'saved' && <div className="ed-saved">{savedNote}</div>}

        {form && (state === 'ready' || state === 'writing') && (
          <>
            <div className="rs-now">
              {isNil ? (
                <>
                  <div className="rs-stat">
                    <span className="rs-k">Budget</span>
                    <span className="rs-v">{form.budget.total.toLocaleString()}</span>
                  </div>
                  <div className="rs-stat">
                    <span className="rs-k">Remaining</span>
                    <span className="rs-v">{form.budget.remaining.toLocaleString()}</span>
                  </div>
                  <div className="rs-stat">
                    <span className="rs-k">Spent on NIL</span>
                    <span className="rs-v">{form.budget.nilSpent.toLocaleString()}</span>
                  </div>
                </>
              ) : (
                <>
                  <div className="rs-stat">
                    <span className="rs-k">Hours</span>
                    <span className="rs-v">{form.hours!.total.toLocaleString()}</span>
                  </div>
                  <div className="rs-stat">
                    <span className="rs-k">Assigned</span>
                    <span className="rs-v">{form.hours!.assigned.toLocaleString()}</span>
                  </div>
                </>
              )}
            </div>

            <div className="ed-sec">{isNil ? 'Raise' : 'Additional hours'}</div>
            <div className="rs-amount">
              <input
                inputMode="numeric"
                value={amount || ''}
                placeholder="0"
                aria-label={`Amount of ${unit} to add`}
                onChange={(e) =>
                  setAmount(Math.min(30000, Number(e.target.value.replace(/\D/g, '') || 0)))
                }
              />
              {steps.map((s) => (
                <button key={s} type="button" className="btn rs-step" onClick={() => setAmount((a) => Math.min(30000, a + s))}>
                  +{s.toLocaleString()}
                </button>
              ))}
              <button type="button" className="btn rs-step" disabled={!amount} onClick={() => setAmount(0)}>
                Clear
              </button>
            </div>

            <div className="rs-preview">
              {applied > 0 ? (
                <>
                  {current.toLocaleString()} → <strong>{(current + applied).toLocaleString()}</strong> {unit}
                  {clamped && (
                    <span className="rs-clamp">
                      {' '}
                      — capped at +{applied.toLocaleString()} by the save format
                    </span>
                  )}
                </>
              ) : headroom === 0 ? (
                <span className="rs-clamp">Already at the save format's cap.</span>
              ) : (
                <span style={{ color: 'var(--ink-3)' }}>Pick an amount to add.</span>
              )}
            </div>

            {error && <div className="ed-error">{error}</div>}

            <div className="ed-foot">
              <span className="ed-target">
                Writes <strong>{form.targetFileName}</strong>
                {form.targetExists ? ' (updates the existing edited copy; a backup is kept)' : ''} —
                the original save is never touched.
              </span>
              <button type="button" className="pf-btn" onClick={onClose}>
                Cancel
              </button>
              <button
                type="button"
                className="btn primary ed-save"
                disabled={applied <= 0 || state === 'writing'}
                onClick={() => void save()}
              >
                {state === 'writing' ? 'WRITING…' : 'SAVE TO COPY'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
