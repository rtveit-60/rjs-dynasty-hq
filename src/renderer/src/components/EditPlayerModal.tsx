import { useEffect, useMemo, useRef, useState } from 'react';
import type { EditMentalSlot, FaceOption, PlayerEditChanges, PlayerEditForm } from '../../../shared/types.ts';
import InfoDot from './InfoDot.tsx';
import { useDialog } from '../lib/dialog.ts';
import { heightFt } from '../lib/format.ts';
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
  /**
   * What the box shows while it is being typed into. Clamping every keystroke
   * would snap "4" to an age floor of 20 before the "5" could follow, so the
   * text is free while focused; an in-range number applies at once, anything
   * else is clamped and applied on blur or Enter.
   */
  const [draft, setDraft] = useState<string | null>(null);

  const clamp = (n: number): number => Math.max(min, Math.min(max, n));
  const step = (dir: 1 | -1): void => {
    setDraft(null);
    const { value: v, onChange: fire } = latest.current;
    const next = clamp(v + dir);
    if (next !== v) fire(next);
  };
  const commit = (): void => {
    if (draft === null) return;
    const { value: v, onChange: fire } = latest.current;
    const next = draft === '' ? v : clamp(Number(draft));
    setDraft(null);
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
        value={draft ?? String(value)}
        aria-label={label}
        onChange={(e) => {
          const digits = e.target.value.replace(/\D/g, '').slice(0, String(max).length);
          setDraft(digits);
          const n = Number(digits);
          if (digits !== '' && n >= min && n <= max && n !== value) onChange(n);
        }}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'ArrowUp') {
            e.preventDefault();
            step(1);
          } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            step(-1);
          } else if (e.key === 'Enter') {
            e.preventDefault();
            commit();
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

type EditTab = 'identity' | 'ratings' | 'abilities' | 'caps' | 'look';
const TABS: { key: EditTab; label: string }[] = [
  { key: 'identity', label: 'IDENTITY' },
  { key: 'ratings', label: 'RATINGS' },
  { key: 'abilities', label: 'ABILITIES' },
  { key: 'caps', label: 'SKILL CAPS' },
  { key: 'look', label: 'APPEARANCE' }
];

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
  const [tab, setTab] = useState<EditTab>('identity');

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [jersey, setJersey] = useState('0');
  const [heightIn, setHeightIn] = useState(72);
  const [weightLb, setWeightLb] = useState(200);
  const [homeState, setHomeState] = useState('');
  const [homeTown, setHomeTown] = useState('');
  const [ratings, setRatings] = useState<Record<string, number>>({});
  const [mental, setMental] = useState<EditMentalSlot[]>([]);
  const [physical, setPhysical] = useState<Record<number, string>>({});
  const [caps, setCaps] = useState<Record<number, number>>({});
  const [skillPoints, setSkillPoints] = useState(0);
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
        setHeightIn(f.heightIn);
        setWeightLb(f.weightLb);
        setHomeState(f.homeState);
        setHomeTown(f.homeTown);
        setRatings(Object.fromEntries(f.ratings.map((r) => [r.field, r.value])));
        setMental(f.mental.map((m) => ({ ...m })));
        setPhysical(Object.fromEntries(f.physical.map((p) => [p.slot, p.rank])));
        setCaps(Object.fromEntries((f.skillCaps ?? []).map((c) => [c.slot, c.cap])));
        setSkillPoints(f.skillPoints);
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
      // An open info dialog or face picker owns the key; its own handler closes it.
      if (document.querySelector('.info-overlay, .fp-overlay')) return;
      e.stopPropagation();
      onClose();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  const panelRef = useRef<HTMLDivElement>(null);
  useDialog(panelRef);

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
    if (heightIn !== form.heightIn) {
      out.heightIn = heightIn;
      any = true;
    }
    if (weightLb !== form.weightLb) {
      out.weightLb = weightLb;
      any = true;
    }
    if (homeState !== form.homeState || homeTown !== form.homeTown) {
      out.homeState = homeState;
      out.homeTown = homeTown;
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
    const changedCaps: Record<number, number> = {};
    for (const c of form.skillCaps ?? []) {
      const v = caps[c.slot];
      if (Number.isFinite(v) && v !== c.cap) changedCaps[c.slot] = v;
    }
    if (Object.keys(changedCaps).length) {
      out.skillCaps = changedCaps;
      any = true;
    }
    if (skillPoints !== form.skillPoints) {
      out.skillPoints = skillPoints;
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
  }, [
    form, firstName, lastName, jersey, heightIn, weightLb, homeState, homeTown, ratings, mental, physical,
    caps, skillPoints, face, gear, skinTone, bodyType
  ]);

  const nameProblem =
    !firstName.trim() || !lastName.trim()
      ? 'Names cannot be empty.'
      : form && firstName.trim().length > form.maxFirstLen
        ? `First name is capped at ${form.maxFirstLen} characters by the save format.`
        : form && lastName.trim().length > form.maxLastLen
          ? `Last name is capped at ${form.maxLastLen} characters by the save format.`
          : null;

  /** Which tabs hold an unsaved change, so a user on another tab can see it. */
  const dirty = useMemo<Set<EditTab>>(() => {
    const s = new Set<EditTab>();
    if (!changes) return s;
    if (
      changes.firstName !== undefined || changes.lastName !== undefined || changes.jersey !== undefined ||
      changes.heightIn !== undefined || changes.weightLb !== undefined || changes.homeState !== undefined
    ) s.add('identity');
    if (changes.ratings) s.add('ratings');
    if (changes.mental || changes.physical) s.add('abilities');
    if (changes.skillCaps || changes.skillPoints !== undefined) s.add('caps');
    if (changes.face || changes.gear || changes.skinTone !== undefined || changes.bodyType !== undefined) s.add('look');
    return s;
  }, [changes]);

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
      <div
        className="ed-panel"
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={form ? `Edit ${form.name}` : 'Edit player'}
        tabIndex={-1}
        onMouseDown={(e) => e.stopPropagation()}
      >
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
            <p>
              Skill caps are the levels each of the player's six skill groups can reach on
              the game's Upgrade Player screen; which groups a player has depends on the
              archetype. Skill points are the unspent balance the game shows there.
            </p>
          </InfoDot>
          <button type="button" className="pf-btn ed-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        {state === 'loading' && <div className="pf-wait">Reading the save…</div>}
        {state === 'missing' && <div className="pf-wait">Nothing editable in the save for this one.</div>}
        {state === 'saved' && (
          <div className="ed-saved" role="status">
            <div className="ed-saved-name">{savedTo}</div>
            Saved. The dashboard now follows the edited copy — load it in the game to play
            with the change.
          </div>
        )}

        {form && (state === 'ready' || state === 'writing') && (
          <>
            <div className="tabs ed-tabs" role="tablist" aria-label="Edit sections">
              {TABS.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  role="tab"
                  aria-selected={tab === t.key}
                  className={`tab ${tab === t.key ? 'active' : ''}`}
                  onClick={() => setTab(t.key)}
                >
                  {t.label}
                  {dirty.has(t.key) && <span className="tab-count" aria-label="unsaved changes"> •</span>}
                </button>
              ))}
            </div>

            {tab === 'identity' && (
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
                  <label className="ed-measure">
                    <span>Height (in)</span>
                    <span>
                      <Stepper
                        value={heightIn}
                        min={form.heightMin}
                        max={form.heightMax}
                        changed={heightIn !== form.heightIn}
                        label="Height in inches"
                        onChange={setHeightIn}
                      />
                      <span className="ed-ft" aria-live="polite">{heightFt(heightIn)}</span>
                    </span>
                  </label>
                  <label className="ed-measure">
                    <span>Weight (lb)</span>
                    <Stepper
                      value={weightLb}
                      min={form.weightMin}
                      max={form.weightMax}
                      changed={weightLb !== form.weightLb}
                      label="Weight in pounds"
                      onChange={setWeightLb}
                    />
                  </label>
                  <label>
                    <span>Home state</span>
                    <select
                      value={homeState}
                      onChange={(e) => {
                        const st = e.target.value;
                        setHomeState(st);
                        setHomeTown(form.cities[st]?.[0]?.town ?? '');
                      }}
                    >
                      {Object.keys(form.cities)
                        .sort()
                        .map((st) => (
                          <option key={st} value={st}>
                            {st.replace(/([a-z])([A-Z])/g, '$1 $2')}
                          </option>
                        ))}
                    </select>
                  </label>
                  <label>
                    <span>Hometown</span>
                    <select value={homeTown} onChange={(e) => setHomeTown(e.target.value)}>
                      {homeTown && !(form.cities[homeState] ?? []).some((c) => c.town === homeTown) && (
                        <option value={homeTown}>{homeTown}</option>
                      )}
                      {(form.cities[homeState] ?? []).map((c) => (
                        <option key={c.town} value={c.town}>
                          {c.town}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </>
            )}

            {tab === 'ratings' && (
              <>
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
              </>
            )}

            {tab === 'abilities' && (
              <>
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
              </>
            )}

            {tab === 'caps' && (
              <>
                <div className="ed-sec">Skill caps</div>
                {form.skillCaps === null ? (
                  <p className="cr-note">The game defines no skill groups for this archetype.</p>
                ) : (
                  <div className="ed-caps">
                    {form.skillCaps.map((c) => (
                      <div key={c.slot} className="ed-cap">
                        <span
                          className="ed-cap-key"
                          style={{ background: `rgb(${c.rgb[0]}, ${c.rgb[1]}, ${c.rgb[2]})` }}
                          aria-hidden="true"
                        />
                        <div>
                          <div className="ed-cap-name">{c.name}</div>
                          <div className="ed-cap-skills">
                            {c.skills.map((s, i) => (
                              <span key={s.field} className={s.tier}>
                                {i > 0 ? ' · ' : ''}
                                {s.name}
                              </span>
                            ))}
                          </div>
                        </div>
                        <label className="ed-cap-level">
                          Cap
                          <Stepper
                            value={caps[c.slot] ?? c.cap}
                            min={0}
                            max={form.skillCapMax}
                            changed={(caps[c.slot] ?? c.cap) !== c.cap}
                            label={`${c.name} cap`}
                            onChange={(n) => setCaps((prev) => ({ ...prev, [c.slot]: n }))}
                          />
                        </label>
                      </div>
                    ))}
                  </div>
                )}
                <div className="ed-sp">
                  <span className="ed-sp-label">Skill points</span>
                  <span className="ed-sp-note">Unspent balance shown on the game's Upgrade Player screen.</span>
                  <Stepper
                    value={skillPoints}
                    min={0}
                    max={form.skillPointsMax}
                    changed={skillPoints !== form.skillPoints}
                    label="Skill points"
                    onChange={setSkillPoints}
                  />
                </div>
              </>
            )}

            {tab === 'look' && (
              <>
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
              </>
            )}

            {(error || nameProblem) && <div className="ed-error" role="alert">{error ?? nameProblem}</div>}

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
