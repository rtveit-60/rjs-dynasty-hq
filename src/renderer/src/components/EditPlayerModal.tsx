import { useEffect, useMemo, useRef, useState } from 'react';
import type { EditMentalSlot, FaceOption, PlayerEditChanges, PlayerEditForm } from '../../../shared/types.ts';
import InfoDot from './InfoDot.tsx';
import LookSection, { effectiveLook } from './LookSection.tsx';

/**
 * Broadcast-style number stepper: a segmented − / value / + plate replacing
 * the browser's native spinners. Typing still works (digits only), arrow keys
 * step, and holding a stepper button repeats.
 */
export function Stepper({
  value,
  min,
  max,
  changed,
  label,
  onChange
}: {
  value: number;
  min: number;
  max: number;
  changed: boolean;
  label: string;
  onChange: (next: number) => void;
}) {
  const repeat = useRef<{ t: number | null; i: number | null }>({ t: null, i: null });
  const latest = useRef({ value, onChange });
  latest.current = { value, onChange };

  const clamp = (n: number): number => Math.max(min, Math.min(max, n));
  const step = (dir: 1 | -1): void => {
    const { value: v, onChange: fire } = latest.current;
    const next = clamp(v + dir);
    if (next !== v) fire(next);
  };
  const stopRepeat = (): void => {
    if (repeat.current.t !== null) window.clearTimeout(repeat.current.t);
    if (repeat.current.i !== null) window.clearInterval(repeat.current.i);
    repeat.current = { t: null, i: null };
  };
  const startRepeat = (dir: 1 | -1): void => {
    step(dir);
    stopRepeat();
    repeat.current.t = window.setTimeout(() => {
      repeat.current.i = window.setInterval(() => step(dir), 55);
    }, 350);
  };
  useEffect(() => stopRepeat, []);

  return (
    <span className={`ed-step ${changed ? 'changed' : ''}`}>
      <button
        type="button"
        tabIndex={-1}
        aria-label={`${label} down`}
        disabled={value <= min}
        onPointerDown={(e) => e.button === 0 && startRepeat(-1)}
        onPointerUp={stopRepeat}
        onPointerLeave={stopRepeat}
        onClick={(e) => e.detail === 0 && step(-1)}
      >
        −
      </button>
      <input
        inputMode="numeric"
        value={value}
        aria-label={label}
        onChange={(e) => {
          const digits = e.target.value.replace(/\D/g, '').slice(0, String(max).length);
          onChange(clamp(Number(digits || 0)));
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowUp') {
            e.preventDefault();
            step(1);
          } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            step(-1);
          }
        }}
        onFocus={(e) => e.target.select()}
      />
      <button
        type="button"
        tabIndex={-1}
        aria-label={`${label} up`}
        disabled={value >= max}
        onPointerDown={(e) => e.button === 0 && startRepeat(1)}
        onPointerUp={stopRepeat}
        onPointerLeave={stopRepeat}
        onClick={(e) => e.detail === 0 && step(1)}
      >
        +
      </button>
    </span>
  );
}

/**
 * The Edit Player dialog, opened from a profile's EDIT control. Values and
 * limits come from the save schema over player:editform; the write goes to
 * the <save>_RJsEdited sibling file — the user's original save is never
 * touched — and the dashboard switches to follow the edited copy.
 */
export default function EditPlayerModal({
  playerRow,
  onClose
}: {
  playerRow: number;
  onClose: () => void;
}) {
  const [form, setForm] = useState<PlayerEditForm | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'missing' | 'writing' | 'saved'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [savedTo, setSavedTo] = useState('');

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [jersey, setJersey] = useState('0');
  const [ratings, setRatings] = useState<Record<string, number>>({});
  const [mental, setMental] = useState<EditMentalSlot[]>([]);
  const [physical, setPhysical] = useState<Record<number, string>>({});
  const [gear, setGear] = useState<Record<string, string>>({});
  const [skinTone, setSkinTone] = useState(0);
  const [bodyType, setBodyType] = useState(0);
  const [face, setFace] = useState<FaceOption | null>(null);

  useEffect(() => {
    let alive = true;
    void window.hq
      .getEditForm(playerRow)
      .then((f) => {
        if (!alive) return;
        if (!f) {
          setState('missing');
          return;
        }
        setForm(f);
        setFirstName(f.firstName);
        setLastName(f.lastName);
        setJersey(String(f.jersey ?? 0));
        setRatings(Object.fromEntries(f.ratings.map((r) => [r.field, r.value])));
        setMental(f.mental.map((m) => ({ ...m })));
        setPhysical(Object.fromEntries(f.physical.map((p) => [p.slot, p.rank])));
        setGear(effectiveLook(f.look ?? {}));
        setSkinTone(f.lookTone ?? 0);
        setBodyType(f.lookBody ?? 0);
        setState('ready');
      })
      .catch(() => alive && setState('missing'));
    return () => {
      alive = false;
    };
  }, [playerRow]);

  // Capture-phase Esc, so closing the editor never also pops the profile under
  // it. An open info dialog owns the key first — its own handler closes it.
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

  /** Only what actually changed goes over the wire — and into the save. */
  const changes: PlayerEditChanges | null = useMemo(() => {
    if (!form) return null;
    const out: PlayerEditChanges = { playerRow: form.playerRow };
    let any = false;
    if (firstName.trim() !== form.firstName) {
      out.firstName = firstName.trim();
      any = true;
    }
    if (lastName.trim() !== form.lastName) {
      out.lastName = lastName.trim();
      any = true;
    }
    if (form.jersey !== null && Number(jersey) !== form.jersey) {
      out.jersey = Number(jersey);
      any = true;
    }
    const changedRatings: Record<string, number> = {};
    for (const r of form.ratings) {
      const v = ratings[r.field];
      if (Number.isFinite(v) && v !== r.value) changedRatings[r.field] = v;
    }
    if (Object.keys(changedRatings).length) {
      out.ratings = changedRatings;
      any = true;
    }
    const changedMental = mental.filter((m, i) => {
      const was = form.mental[i];
      return was && (m.ability !== was.ability || m.rank !== was.rank);
    });
    if (changedMental.length) {
      out.mental = changedMental;
      any = true;
    }
    const changedPhysical = form.physical
      .filter((p) => physical[p.slot] !== undefined && physical[p.slot] !== p.rank)
      .map((p) => ({ slot: p.slot, rank: physical[p.slot] }));
    if (changedPhysical.length) {
      out.physical = changedPhysical;
      any = true;
    }
    if (face) {
      out.face = face;
      any = true;
    }
    // Appearance diffs against the shown look, so untouched dropdowns write
    // nothing and '' drops a slot from the player's blob. Undressed prospects
    // are face-only: the game dresses them at enrollment.
    if (form.look !== null) {
      const baseLook = effectiveLook(form.look);
      const changedGear: Record<string, string> = {};
      for (const g of form.gearSlots) {
        const shown = gear[g.slot] ?? '';
        if (shown !== (baseLook[g.slot] ?? '')) changedGear[g.slot] = shown;
      }
      if (Object.keys(changedGear).length) {
        out.gear = changedGear;
        any = true;
      }
      if (skinTone !== (form.lookTone ?? 0) && skinTone !== 0) {
        out.skinTone = skinTone;
        any = true;
      }
      if (bodyType !== (form.lookBody ?? 0)) {
        out.bodyType = bodyType;
        any = true;
      }
    }
    return any ? out : null;
  }, [form, firstName, lastName, jersey, ratings, mental, physical, face, gear, skinTone, bodyType]);

  const nameProblem =
    !firstName.trim() || !lastName.trim()
      ? 'Names cannot be empty.'
      : form && firstName.trim().length > form.maxFirstLen
        ? `First name is capped at ${form.maxFirstLen} characters by the save format.`
        : form && lastName.trim().length > form.maxLastLen
          ? `Last name is capped at ${form.maxLastLen} characters by the save format.`
          : null;

  const save = async (): Promise<void> => {
    if (!changes || nameProblem) return;
    setState('writing');
    setError(null);
    try {
      const res = await window.hq.editPlayer(changes);
      if (res.ok) {
        setSavedTo(res.editedFileName ?? '');
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
      <div className="ed-panel" onMouseDown={(e) => e.stopPropagation()}>
        <div className="ed-head">
          <span className="ed-title">
            {form ? `Edit ${form.isRecruit ? 'Recruit' : 'Player'}` : 'Edit Player'}
          </span>
          {form && <span className="ed-who">{form.name} · {form.position}</span>}
          <InfoDot title="Editing and your save">
            <p>
              Edits are written to a separate copy of your dynasty save named{' '}
              <strong>…_RJsEdited</strong>, created next to the original. The original file is
              never modified. The dashboard follows the edited copy from then on; load that
              save in the game to play with your changes.
            </p>
            <p>
              Editing the edited copy again updates it in place, after a timestamped backup.
              Overall rating is recalculated by the game itself the next time it loads the
              save, so it may lag here until then. Edit while the game is closed — an
              in-game save overwrites whichever file it has loaded.
            </p>
          </InfoDot>
          <button type="button" className="pf-btn ed-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        {state === 'loading' && <div className="pf-wait">Reading the save…</div>}
        {state === 'missing' && <div className="pf-wait">Nothing editable in the save for this one.</div>}
        {state === 'saved' && (
          <div className="ed-saved">
            <div className="ed-saved-name">{savedTo}</div>
            Saved. The dashboard now follows the edited copy — load it in the game to play
            with the change.
          </div>
        )}

        {form && (state === 'ready' || state === 'writing') && (
          <>
            <div className="ed-sec">Identity</div>
            <div className="ed-identity">
              <label>
                <span>First name</span>
                <input
                  value={firstName}
                  maxLength={form.maxFirstLen}
                  onChange={(e) => setFirstName(e.target.value)}
                />
              </label>
              <label>
                <span>Last name</span>
                <input
                  value={lastName}
                  maxLength={form.maxLastLen}
                  onChange={(e) => setLastName(e.target.value)}
                />
              </label>
              {form.jersey !== null && (
                <label className="ed-jersey">
                  <span>Jersey</span>
                  <Stepper
                    value={Number(jersey)}
                    min={0}
                    max={99}
                    changed={Number(jersey) !== form.jersey}
                    label="Jersey"
                    onChange={(n) => setJersey(String(n))}
                  />
                </label>
              )}
            </div>

            <div className="ed-sec">Ratings</div>
            <div className="ed-grid">
              {form.ratings.map((r) => (
                <label key={r.field} className="ed-cell" title={r.field.replace(/Rating$/, '')}>
                  <span>{r.label}</span>
                  <Stepper
                    value={ratings[r.field] ?? 0}
                    min={0}
                    max={99}
                    changed={ratings[r.field] !== r.value}
                    label={r.label}
                    onChange={(n) => setRatings((prev) => ({ ...prev, [r.field]: n }))}
                  />
                </label>
              ))}
            </div>

            <div className="ed-sec">Mental abilities</div>
            <div className="ed-rows">
              {mental.map((m, i) => (
                <div key={m.slot} className="ed-row">
                  <span className="ed-slot">{m.slot}</span>
                  <select
                    value={m.ability}
                    onChange={(e) =>
                      setMental((prev) =>
                        prev.map((x, j) =>
                          j === i
                            ? {
                                ...x,
                                ability: e.target.value,
                                rank: e.target.value === 'None' ? 'None' : x.rank === 'None' ? 'Bronze' : x.rank
                              }
                            : x
                        )
                      )
                    }
                  >
                    <option value="None">—</option>
                    {form.mentalOptions.map((o) => (
                      <option key={o.id} value={o.id} title={o.desc ?? undefined}>
                        {o.name}
                      </option>
                    ))}
                  </select>
                  <select
                    value={m.rank}
                    disabled={m.ability === 'None'}
                    onChange={(e) =>
                      setMental((prev) => prev.map((x, j) => (j === i ? { ...x, rank: e.target.value } : x)))
                    }
                  >
                    {form.rankOptions.map((r) => (
                      <option key={r} value={r}>
                        {r === 'None' ? '—' : r}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>

            {form.physical.length > 0 && (
              <>
                <div className="ed-sec">Physical abilities</div>
                <div className="ed-rows">
                  {form.physical.map((p) => (
                    <div key={p.slot} className="ed-row">
                      <span className="ed-slot">{p.slot}</span>
                      <span className="ed-phys-name">{p.name}</span>
                      <select
                        value={physical[p.slot] ?? p.rank}
                        onChange={(e) =>
                          setPhysical((prev) => ({ ...prev, [p.slot]: e.target.value }))
                        }
                      >
                        {form.rankOptions.map((r) => (
                          <option key={r} value={r}>
                            {r === 'None' ? '—' : r}
                          </option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              </>
            )}

            <div className="ed-sec">Appearance</div>
            {form.look === null && (
              <p className="cr-note">
                The game dresses this prospect at enrollment — until then only the face
                can be set. Gear, body type and skin tone unlock once they're rostered.
              </p>
            )}
            {form.currentFace.unique && (
              <p className="cr-note">
                This player has an individually scanned face. Picking a catalog face
                replaces it in the edited copy; the original save keeps the scan.
              </p>
            )}
            <LookSection
              gearSlots={form.gearSlots}
              helmetMasks={form.helmetMasks}
              skinTones={form.skinTones}
              faces={form.faces}
              base={effectiveLook(form.look ?? {})}
              gear={gear}
              setGear={setGear}
              skinTone={skinTone}
              setSkinTone={setSkinTone}
              face={face}
              setFace={setFace}
              bodyType={bodyType}
              setBodyType={setBodyType}
              currentPortraitId={form.currentFace.portraitId || undefined}
              faceOnly={form.look === null}
            />

            {(error || nameProblem) && <div className="ed-error">{error ?? nameProblem}</div>}

            <div className="ed-foot">
              <span className="ed-target">
                Writes <strong>{form.targetFileName}</strong>
                {form.targetExists ? ' (replaces the existing edited copy; a backup is kept)' : ''} —
                the original save is never touched.
              </span>
              <button type="button" className="pf-btn" onClick={onClose}>
                Cancel
              </button>
              <button
                type="button"
                className="btn primary ed-save"
                disabled={!changes || !!nameProblem || state === 'writing'}
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
