import { useEffect, useMemo, useState } from 'react';
import type { CreateRecruitForm, FaceOption } from '../../../shared/types.ts';
import { archetypeLabel, devLabel, heightFt, recruitPos, spaceOut } from '../lib/format.ts';
import { Stepper } from './EditPlayerModal.tsx';
import LookSection, { effectiveLook } from './LookSection.tsx';
import InfoDot from './InfoDot.tsx';

/**
 * Create a brand-new high-school recruit. The save side clones an
 * archetype-matched template from the class and overrides what's entered
 * here; ratings start from that template and are refined afterwards through
 * the profile's EDIT, like any other recruit.
 */
export default function CreateRecruitModal({ onClose }: { onClose: () => void }) {
  const [form, setForm] = useState<CreateRecruitForm | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'missing' | 'writing' | 'saved'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [savedNote, setSavedNote] = useState('');

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [position, setPosition] = useState('QB');
  const [archetype, setArchetype] = useState('');
  const [stars, setStars] = useState(3);
  const [devTrait, setDevTrait] = useState('Normal');
  const [heightIn, setHeightIn] = useState(74);
  const [weightLb, setWeightLb] = useState(210);
  const [homeState, setHomeState] = useState('');
  const [homeTown, setHomeTown] = useState('');
  const [skinTone, setSkinTone] = useState(0);
  const [bodyType, setBodyType] = useState(0);
  const [gear, setGear] = useState<Record<string, string>>({});
  const [face, setFace] = useState<FaceOption | null>(null);

  useEffect(() => {
    let alive = true;
    void window.hq
      .getCreateForm()
      .then((f) => {
        if (!alive) return;
        if (!f || !Object.keys(f.archetypesByPosition).length) {
          setState('missing');
          return;
        }
        setForm(f);
        const firstPos = Object.keys(f.archetypesByPosition).includes('QB')
          ? 'QB'
          : Object.keys(f.archetypesByPosition).sort()[0];
        setPosition(firstPos);
        setArchetype(f.archetypesByPosition[firstPos][0]);
        const st0 = f.states.find((x) => (f.cities[x] ?? []).length) ?? f.states[0] ?? '';
        setHomeState(st0);
        setHomeTown(f.cities[st0]?.[0]?.town ?? '');
        setDevTrait(f.devTraits[0] ?? 'Normal');
        setGear(effectiveLook(f.baseLook[firstPos] ?? {}));
        setSkinTone(f.baseTones[firstPos] ?? 0);
        setBodyType(f.baseBodies[firstPos] ?? 0);
        setState('ready');
      })
      .catch(() => alive && setState('missing'));
    return () => {
      alive = false;
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

  const positions = useMemo(
    () => (form ? Object.keys(form.archetypesByPosition).sort() : []),
    [form]
  );

  const nameProblem = !firstName.trim()
    ? 'A first name is required.'
    : !lastName.trim()
      ? 'A last name is required.'
      : form && firstName.trim().length > form.maxFirstLen
        ? `First name is capped at ${form.maxFirstLen} characters.`
        : form && lastName.trim().length > form.maxLastLen
          ? `Last name is capped at ${form.maxLastLen} characters.`
          : form && homeTown.trim().length > form.maxTownLen
            ? `Hometown is capped at ${form.maxTownLen} characters.`
            : null;

  const save = async (): Promise<void> => {
    if (!form || nameProblem) return;
    setState('writing');
    setError(null);
    try {
      const res = await window.hq.createRecruit({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        position,
        archetype,
        stars,
        devTrait,
        heightIn,
        weightLb,
        homeState,
        homeTown: homeTown.trim(),
        face: face ?? undefined
      });
      if (res.ok) {
        setSavedNote(`${res.message} Search the board for the name, stage + to target them, and refine ratings through the profile's EDIT.`);
        setState('saved');
        setTimeout(onClose, 4200);
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
          <span className="ed-title">Create Recruit</span>
          <span className="ed-who">joins this year's high-school class</span>
          <InfoDot title="Create Recruit">
            <p>
              The new prospect is built by cloning a same-archetype recruit from the class and
              overriding what you enter here — so their ratings start from a realistic
              template. Refine any of it afterwards through the profile's EDIT, like any
              other recruit.
            </p>
            <p>
              The new prospect takes over the class slot of its lowest-ranked uncommitted
              filler (three stars or fewer) — the game's prospect list only shows slots it
              built at class generation, so joining means replacing. They inherit that
              slot's national rank and pursuit race; commentary will not speak the name.
              Everything writes to an edited copy — the original save is never touched.
            </p>
          </InfoDot>
          <button type="button" className="pf-btn ed-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        {state === 'loading' && <div className="pf-wait">Reading the save…</div>}
        {state === 'missing' && <div className="pf-wait">No class to add a recruit to in this save.</div>}
        {state === 'saved' && <div className="ed-saved">{savedNote}</div>}

        {form && (state === 'ready' || state === 'writing') && (
          <>
            <div className="ed-sec">Identity</div>
            <div className="ed-identity">
              <label>
                <span>First name</span>
                <input value={firstName} maxLength={form.maxFirstLen} onChange={(e) => setFirstName(e.target.value)} />
              </label>
              <label>
                <span>Last name</span>
                <input value={lastName} maxLength={form.maxLastLen} onChange={(e) => setLastName(e.target.value)} />
              </label>
            </div>

            <div className="ed-sec">Profile</div>
            <div className="cr-grid">
              <label className="ta-field">
                <span>Position</span>
                <select
                  value={position}
                  onChange={(e) => {
                    const pos = e.target.value;
                    setPosition(pos);
                    setArchetype(form.archetypesByPosition[pos][0]);
                    // A new position wears its own base look.
                    setGear(effectiveLook(form.baseLook[pos] ?? {}));
                    setSkinTone(face ? face.tone : (form.baseTones[pos] ?? 0));
                    setBodyType(form.baseBodies[pos] ?? 0);
                  }}
                >
                  {positions.map((p) => (
                    <option key={p} value={p}>
                      {recruitPos(p) === p ? p : `${recruitPos(p)} · ${p}`}
                    </option>
                  ))}
                </select>
              </label>
              <label className="ta-field">
                <span>Archetype</span>
                <select value={archetype} onChange={(e) => setArchetype(e.target.value)}>
                  {(form.archetypesByPosition[position] ?? []).map((a) => (
                    <option key={a} value={a}>
                      {archetypeLabel(a)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="ta-field">
                <span>Stars</span>
                <select value={stars} onChange={(e) => setStars(Number(e.target.value))}>
                  {[5, 4, 3, 2, 1].map((n) => (
                    <option key={n} value={n}>
                      {'★'.repeat(n)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="ta-field">
                <span>Development</span>
                <select value={devTrait} onChange={(e) => setDevTrait(e.target.value)}>
                  {form.devTraits.map((d) => (
                    <option key={d} value={d}>
                      {devLabel(d)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="ta-field">
                <span>Height</span>
                <select value={heightIn} onChange={(e) => setHeightIn(Number(e.target.value))}>
                  {Array.from({ length: form.heightMax - form.heightMin + 1 }, (_, i) => form.heightMin + i).map(
                    (h) => (
                      <option key={h} value={h}>
                        {heightFt(h)}
                      </option>
                    )
                  )}
                </select>
              </label>
              <label className="ta-field">
                <span>Weight</span>
                <Stepper
                  value={weightLb}
                  min={form.weightMin}
                  max={form.weightMax}
                  changed={false}
                  label="Weight"
                  onChange={setWeightLb}
                />
              </label>
              <label className="ta-field">
                <span>Home state</span>
                <select
                  value={homeState}
                  onChange={(e) => {
                    const st = e.target.value;
                    setHomeState(st);
                    // Towns are the game's own list per state; pipeline follows.
                    setHomeTown(form.cities[st]?.[0]?.town ?? '');
                  }}
                >
                  {form.states.map((s) => (
                    <option key={s} value={s}>
                      {spaceOut(s)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="ta-field">
                <span>Hometown</span>
                <select value={homeTown} onChange={(e) => setHomeTown(e.target.value)}>
                  {(form.cities[homeState] ?? []).map((c) => (
                    <option key={c.town} value={c.town}>
                      {c.town}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="ed-sec">Face</div>
            <p className="cr-note">
              The head and portrait carry onto the recruit. The game dresses recruits
              itself at enrollment — gear, body type and skin tone become editable from
              the profile once they're on a roster.
            </p>
            <LookSection
              gearSlots={form.gearSlots}
              helmetMasks={form.helmetMasks}
              skinTones={form.skinTones}
              faces={form.faces}
              base={effectiveLook(form.baseLook[position] ?? {})}
              gear={gear}
              setGear={setGear}
              skinTone={skinTone}
              setSkinTone={setSkinTone}
              face={face}
              setFace={setFace}
              bodyType={bodyType}
              setBodyType={setBodyType}
              faceOnly
            />

            {(error || (nameProblem && (firstName || lastName))) && (
              <div className="ed-error">{error ?? nameProblem}</div>
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
                disabled={!!nameProblem || state === 'writing'}
                onClick={() => void save()}
              >
                {state === 'writing' ? 'WRITING…' : 'CREATE'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
