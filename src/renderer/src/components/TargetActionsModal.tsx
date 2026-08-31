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
  const [scoutPasses, setScoutPasses] = useState(0);

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
      (form.intel < form.intelMax ? ACTION_HOURS.scoutFull * scoutPasses : 0) +
      (scholarship === 'Offered' && form.scholarship !== 'Offered' ? ACTION_HOURS.scholarship : 0)
    : 0;
  const poolAfter = form ? form.poolAssigned - form.hours + derivedHours : 0;
  const budgetCeiling = form ? form.budgetBase + form.budgetBonus : 0;
  const overBudget = form ? derivedHours > budgetCeiling : false;
  const overPool = form ? poolAfter > form.poolTotal || overBudget : false;
  // The blocker: options that would push the plan past the prospect's weekly
  // allotment — or past the board pool's remaining headroom — lock instead of
  // arming a rejected save. Deselecting is always allowed.
  const maxSpend = form
    ? Math.min(budgetCeiling, form.poolTotal - (form.poolAssigned - form.hours))
    : 0;
  const hoursLeft = maxSpend - derivedHours;
  const offerLocked = form
    ? scholarship !== 'Offered' && form.scholarship !== 'Offered' && ACTION_HOURS.scholarship > hoursLeft
    : false;
  const swayLocked = swayPitch === 'Invalid' && ACTION_HOURS.sway > hoursLeft;
  const scoutMax = form
    ? Math.min(
        form.scoutsMax - form.scoutsDone,
        scoutPasses + Math.max(0, Math.floor(hoursLeft / ACTION_HOURS.scoutFull))
      )
    : 0;
  const anyLocked =
    ACTION_LABELS.some(({ key, cost }) => !actions[key] && cost > hoursLeft) ||
    offerLocked ||
    swayLocked;

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
    if (scoutPasses > 0 && form.intel < form.intelMax) {
      out.scoutPasses = scoutPasses;
      any = true;
    }
    return any ? out : null;
  }, [form, actions, scholarship, nilOffer, swayPitch, scoutPasses]);

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
              You cannot select past the allotment: an option that would push the week over
              this prospect's hours — or over the board pool's remaining headroom — locks
              until you free hours by deselecting something else.
            </p>
            <p>
              One label differs from the save's internals: the action the save calls
              "contact high school coaches" is <strong>DM the Player</strong> in the game
              itself, so that is the name shown here.
            </p>
            <p>
              Scouting is metered: each pass reveals another slice of the recruit's intel and
              five passes reach full knowledge. You can run several in one week if the hours
              fit. Changes land in a <strong>…_RJsEdited</strong> copy; the original save is
              never touched.
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
            <div className="wp-meter">
              <div className="wp-meter-top">
                <span className={`wp-big ${overBudget ? 'over' : ''}`}>
                  {derivedHours}
                  <em>/{budgetCeiling}</em>
                </span>
                <span className="wp-cap">Hours committed · {Math.max(0, hoursLeft)} left</span>
                <span className={`wp-pool ${overPool ? 'over' : ''}`}>
                  Team pool {poolAfter}/{form.poolTotal}
                </span>
              </div>
              <div className="wp-bar">
                <div
                  className={`wp-fill ${overBudget ? 'over' : ''}`}
                  style={{ width: `${Math.min(100, (derivedHours / Math.max(1, budgetCeiling)) * 100)}%` }}
                />
                {form.budgetBonus > 0 && (
                  <div
                    className="wp-tick"
                    title={`${form.budgetBase} base; +${form.budgetBonus} position-group perk`}
                    style={{ left: `${(form.budgetBase / Math.max(1, budgetCeiling)) * 100}%` }}
                  />
                )}
              </div>
            </div>
            {overBudget && (
              <p className="cr-note over">
                {form.budgetBonus > 0
                  ? `This prospect allows ${budgetCeiling} hours (${form.budgetBase} base + ${form.budgetBonus} position-group perk).`
                  : `A prospect allows ${form.budgetBase} hours per week — recruiter perks can raise it.`}
              </p>
            )}
            {anyLocked && (
              <p className="cr-note">
                {hoursLeft <= 0
                  ? 'The budget for this week has been reached — deselect something to free hours.'
                  : `Greyed-out options need more hours than the ${hoursLeft} left this week.`}
              </p>
            )}

            <div className="ed-sec">Actions</div>
            <div className="wp-rows">
              {ACTION_LABELS.map(({ key, label, cost }) => {
                const locked = !actions[key] && cost > hoursLeft;
                return (
                  <label
                    key={key}
                    className={`wp-row ${actions[key] ? 'on' : ''} ${locked ? 'locked' : ''}`}
                  >
                    <input
                      type="checkbox"
                      checked={actions[key]}
                      disabled={locked}
                      onChange={(e) => setActions((prev) => ({ ...prev, [key]: e.target.checked }))}
                    />
                    <span className="wp-box" aria-hidden="true" />
                    <span className="wp-name">{label}</span>
                    {actions[key] !== form.actions[key] && <span className="wp-changed" title="changed this visit" />}
                    <span className="wp-price">{cost} hrs</span>
                  </label>
                );
              })}
            </div>

            <div className="ed-sec">Offers</div>
            <div className="ta-offers">
              <label className={`ta-field ${offerLocked ? 'locked' : ''}`}>
                <span>
                  Scholarship <em>(new offer {ACTION_HOURS.scholarship} hrs)</em>
                </span>
                <select value={scholarship} onChange={(e) => setScholarship(e.target.value)}>
                  {[form.scholarship, 'None', 'Offered', 'Revoked']
                    .filter((v, i, a) => a.indexOf(v) === i)
                    .map((v) => (
                      <option
                        key={v}
                        value={v}
                        disabled={
                          (v === 'Offered' && offerLocked) ||
                          !['None', 'Offered', 'Revoked', form.scholarship].includes(v)
                        }
                      >
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
              <label className={`ta-field ${swayLocked ? 'locked' : ''}`}>
                <span>
                  Sway pitch <em>({ACTION_HOURS.sway} hrs when set)</em>
                </span>
                <select value={swayPitch} onChange={(e) => setSwayPitch(e.target.value)}>
                  <option value="Invalid">—</option>
                  {form.swayOptions.map((o) => (
                    <option key={o.id} value={o.id} disabled={swayLocked}>
                      {o.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="ed-sec">Scouting</div>
            <div className="ta-scout">
              {scouted ? (
                <span className="ta-scouted">Fully scouted ({form.scoutsMax} of {form.scoutsMax} passes)</span>
              ) : (
                <div className={`wp-row wp-scout ${scoutPasses > 0 ? 'on' : ''}`}>
                  <span className="wp-name">
                    Scout passes this week{' '}
                    <em>
                      ({form.scoutsDone} of {form.scoutsMax} done — each reveals another slice
                      {scoutMax >= form.scoutsMax - form.scoutsDone
                        ? `; run all ${form.scoutsMax - form.scoutsDone} to finish now`
                        : `; hours left allow ${scoutMax} this week`})
                    </em>
                  </span>
                  {scoutPasses > 0 && <span className="wp-changed" title="changed this visit" />}
                  <Stepper
                    value={scoutPasses}
                    min={0}
                    max={scoutMax}
                    changed={scoutPasses > 0}
                    label="Scouting passes"
                    onChange={setScoutPasses}
                  />
                  <span className="wp-price">{ACTION_HOURS.scoutFull * scoutPasses} hrs</span>
                </div>
              )}
              {form.scoutBoost > 0 && (
                <p className="cr-note">
                  Your staff's scouting perk adds +{form.scoutBoost} on this prospect's
                  position group — the game applies it on top when it scouts.
                </p>
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
