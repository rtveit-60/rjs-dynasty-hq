import { useEffect, useMemo, useState } from 'react';
import type { TargetActionChanges, TargetActionFlags, TargetActionForm } from '../../../shared/types.ts';
import { stars } from '../lib/format.ts';
import { ACTION_HOURS, ACTION_LABELS as GAME_ACTION_LABELS } from '../../../shared/recruiting-actions.ts';
import { Stepper } from './EditPlayerModal.tsx';
import InfoDot from './InfoDot.tsx';

/** The game's own action names and hour prices (the save's field for
 *  contactCoaches has drifted — in-game it is "DM the Player"). */
const ACTION_LABELS: { key: keyof TargetActionFlags; label: string; cost: number }[] = [
  { key: 'contactFamily', label: GAME_ACTION_LABELS.contactFamily, cost: ACTION_HOURS.contactFamily },
  { key: 'contactCoaches', label: GAME_ACTION_LABELS.contactCoaches, cost: ACTION_HOURS.contactCoaches },
  { key: 'socialMedia', label: GAME_ACTION_LABELS.socialMedia, cost: ACTION_HOURS.socialMedia },
  { key: 'sendHouse', label: GAME_ACTION_LABELS.sendHouse, cost: ACTION_HOURS.sendHouse },
  { key: 'visitSchool', label: GAME_ACTION_LABELS.visitSchool, cost: ACTION_HOURS.visitSchool }
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

  // Hours are the sum of the game's fixed action prices, not a free number.
  const derivedHours = form
    ? ACTION_LABELS.reduce((sum, a) => sum + (actions[a.key] ? a.cost : 0), 0) +
      (swayPitch !== 'Invalid' ? ACTION_HOURS.sway : 0) +
      (scoutFull && form.intel < form.intelMax ? ACTION_HOURS.scoutFull : 0) +
      (scholarship === 'Offered' && form.scholarship !== 'Offered' ? ACTION_HOURS.scholarship : 0)
    : 0;
  const poolAfter = form ? form.poolAssigned - form.hours + derivedHours : 0;
  const overPool = form ? poolAfter > form.poolTotal || derivedHours > form.hoursCap : false;

  const changes: TargetActionChanges | null = useMemo(() => {
    if (!form) return null;
    const out: TargetActionChanges = { recruitRow: form.recruitRow };
    let any = false;
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
  }, [form, actions, scholarship, nilOffer, swayPitch, scoutFull]);

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
              board. Hours are not assigned freely — each action carries the game's fixed
              price (shown beside it), a sway pitch costs {ACTION_HOURS.sway}, full scouting{' '}
              {ACTION_HOURS.scoutFull}, a new scholarship offer {ACTION_HOURS.scholarship} —
              and the prospect's week is the sum of what you select. The game consumes it all
              when it processes the next week.
            </p>
            <p>
              One label differs from the save's internals: the action the save calls
              "contact high school coaches" is <strong>DM the Player</strong> in the game
              itself, so that is the name shown here.
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
            <div className="ed-sec">Actions</div>
            <div className="ta-actions">
              {ACTION_LABELS.map(({ key, label, cost }) => (
                <label key={key} className={`ta-check ${actions[key] !== form.actions[key] ? 'changed' : ''}`}>
                  <input
                    type="checkbox"
                    checked={actions[key]}
                    onChange={(e) => setActions((prev) => ({ ...prev, [key]: e.target.checked }))}
                  />
                  <span>{label}</span>
                  <span className="ta-cost">{cost} hrs</span>
                </label>
              ))}
            </div>
            <div className="ta-hours">
              <span className="ta-total">
                {derivedHours} hrs this week
              </span>
              <span className={`ta-pool ${overPool ? 'over' : ''}`}>
                pool {poolAfter}/{form.poolTotal} assigned
              </span>
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
