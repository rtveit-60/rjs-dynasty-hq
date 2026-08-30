import { useEffect, useMemo, useState } from 'react';
import type { TargetActionChanges, TargetActionFlags, TargetActionForm } from '../../../shared/types.ts';
import { stars } from '../lib/format.ts';
import { Stepper } from './EditPlayerModal.tsx';
import InfoDot from './InfoDot.tsx';

const ACTION_LABELS: { key: keyof TargetActionFlags; label: string }[] = [
  { key: 'contactFamily', label: 'Contact Friends & Family' },
  { key: 'contactCoaches', label: 'Contact High School Coaches' },
  { key: 'socialMedia', label: 'Search Social Media' },
  { key: 'sendHouse', label: 'Send the House' },
  { key: 'visitSchool', label: "Visit Recruit's School" }
];

/**
 * One target's weekly plan — hours, the game's five contact/visit actions,
 * scholarship and NIL offers, sway pitch, and scouting — written through the
 * guarded _RJsEdited path. The fields are the game's own weekly action state;
 * its next processed week consumes them.
 */
export default function TargetActionsModal({
  recruitRow,
  onClose
}: {
  recruitRow: number;
  onClose: () => void;
}) {
  const [form, setForm] = useState<TargetActionForm | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'missing' | 'writing' | 'saved'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [savedNote, setSavedNote] = useState('');

  const [hours, setHours] = useState(0);
  const [actions, setActions] = useState<TargetActionFlags>({
    contactFamily: false,
    contactCoaches: false,
    socialMedia: false,
    sendHouse: false,
    visitSchool: false
  });
  const [scholarship, setScholarship] = useState('None');
  const [nilOffer, setNilOffer] = useState(0);
  const [swayPitch, setSwayPitch] = useState('Invalid');
  const [scoutFull, setScoutFull] = useState(false);

  useEffect(() => {
    let alive = true;
    void window.hq
      .getTargetForm(recruitRow)
      .then((f) => {
        if (!alive) return;
        if (!f) {
          setState('missing');
          return;
        }
        setForm(f);
        setHours(f.hours);
        setActions({ ...f.actions });
        setScholarship(f.scholarship);
        setNilOffer(f.nilOffer);
        setSwayPitch(f.swayPitch);
        setState('ready');
      })
      .catch(() => alive && setState('missing'));
    return () => {
      alive = false;
    };
  }, [recruitRow]);

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

  const poolAfter = form ? form.poolAssigned - form.hours + hours : 0;
  const overPool = form ? poolAfter > form.poolTotal : false;
  /** Hours cap for the stepper: field cap, then whatever the pool leaves. */
  const hoursMax = form
    ? Math.min(form.hoursCap, form.hours + Math.max(0, form.poolTotal - form.poolAssigned))
    : 0;

  const changes: TargetActionChanges | null = useMemo(() => {
    if (!form) return null;
    const out: TargetActionChanges = { recruitRow: form.recruitRow };
    let any = false;
    if (hours !== form.hours) {
      out.hours = hours;
      any = true;
    }
    const changedActions: Partial<TargetActionFlags> = {};
    for (const { key } of ACTION_LABELS) {
      if (actions[key] !== form.actions[key]) changedActions[key] = actions[key];
    }
    if (Object.keys(changedActions).length) {
      out.actions = changedActions;
      any = true;
    }
    if (scholarship !== form.scholarship && ['Offered', 'Revoked', 'None'].includes(scholarship)) {
      out.scholarship = scholarship as 'Offered' | 'Revoked' | 'None';
      any = true;
    }
    if (nilOffer !== form.nilOffer) {
      out.nilOffer = nilOffer;
      any = true;
    }
    if (swayPitch !== form.swayPitch) {
      out.swayPitch = swayPitch;
      any = true;
    }
    if (scoutFull && form.intel < form.intelMax) {
      out.scoutFull = true;
      any = true;
    }
    return any ? out : null;
  }, [form, hours, actions, scholarship, nilOffer, swayPitch, scoutFull]);

  const save = async (): Promise<void> => {
    if (!changes || overPool) return;
    setState('writing');
    setError(null);
    try {
      const res = await window.hq.editTarget(changes);
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

  const scouted = form ? form.intel >= form.intelMax : false;

  return (
    <div className="ed-overlay" onMouseDown={onClose}>
      <div className="ed-panel rs-panel" onMouseDown={(e) => e.stopPropagation()}>
        <div className="ed-head">
          <span className="ed-title">Weekly Plan</span>
          {form && (
            <span className="ed-who">
              {form.name} · {form.position} · {stars(form.stars).slice(0, form.stars)}
            </span>
          )}
          <InfoDot title="Weekly plan">
            <p>
              These are the game's own weekly recruiting controls, written straight to your
              board: assigned hours, the five contact and visit actions, scholarship and NIL
              offers, and the pitch to sway toward. The game consumes them when it processes
              the next week.
            </p>
            <p>
              Scout fully unlocks every piece of the recruit's intel at once — the same state
              the game reaches after full scouting. Changes land in a{' '}
              <strong>…_RJsEdited</strong> copy; the original save is never touched.
            </p>
          </InfoDot>
          <button type="button" className="pf-btn ed-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        {state === 'loading' && <div className="pf-wait">Reading the save…</div>}
        {state === 'missing' && <div className="pf-wait">That recruit is not on your board.</div>}
        {state === 'saved' && <div className="ed-saved">{savedNote}</div>}

        {form && (state === 'ready' || state === 'writing') && (
          <>
            <div className="ed-sec">Hours this week</div>
            <div className="ta-hours">
              <Stepper
                value={hours}
                min={0}
                max={hoursMax}
                changed={hours !== form.hours}
                label="Assigned hours"
                onChange={setHours}
              />
              <span className={`ta-pool ${overPool ? 'over' : ''}`}>
                pool {poolAfter}/{form.poolTotal} assigned
              </span>
            </div>

            <div className="ed-sec">Actions</div>
            <div className="ta-actions">
              {ACTION_LABELS.map(({ key, label }) => (
                <label key={key} className={`ta-check ${actions[key] !== form.actions[key] ? 'changed' : ''}`}>
                  <input
                    type="checkbox"
                    checked={actions[key]}
                    onChange={(e) => setActions((prev) => ({ ...prev, [key]: e.target.checked }))}
                  />
                  <span>{label}</span>
                </label>
              ))}
            </div>

            <div className="ed-sec">Offers</div>
            <div className="ta-offers">
              <label className="ta-field">
                <span>Scholarship</span>
                <select value={scholarship} onChange={(e) => setScholarship(e.target.value)}>
                  {[form.scholarship, 'None', 'Offered', 'Revoked']
                    .filter((v, i, a) => a.indexOf(v) === i)
                    .map((v) => (
                      <option key={v} value={v} disabled={!['None', 'Offered', 'Revoked', form.scholarship].includes(v)}>
                        {v}
                      </option>
                    ))}
                </select>
              </label>
              <label className="ta-field">
                <span>
                  NIL offer <em>(expects {form.nilExpectation})</em>
                </span>
                <Stepper
                  value={nilOffer}
                  min={0}
                  max={form.nilCap}
                  changed={nilOffer !== form.nilOffer}
                  label="NIL offer"
                  onChange={setNilOffer}
                />
              </label>
              <label className="ta-field">
                <span>Sway pitch</span>
                <select value={swayPitch} onChange={(e) => setSwayPitch(e.target.value)}>
                  <option value="Invalid">—</option>
                  {form.swayOptions.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="ed-sec">Scouting</div>
            <div className="ta-scout">
              {scouted ? (
                <span className="ta-scouted">Fully scouted</span>
              ) : (
                <label className={`ta-check ${scoutFull ? 'changed' : ''}`}>
                  <input
                    type="checkbox"
                    checked={scoutFull}
                    onChange={(e) => setScoutFull(e.target.checked)}
                  />
                  <span>Scout fully ({form.intel} of {form.intelMax} intel unlocked now)</span>
                </label>
              )}
            </div>

            {(error || overPool) && (
              <div className="ed-error">
                {error ?? `That assignment leaves the weekly pool over-assigned (${poolAfter} of ${form.poolTotal}).`}
              </div>
            )}

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
                disabled={!changes || overPool || state === 'writing'}
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
