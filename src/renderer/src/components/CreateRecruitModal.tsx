import { useEffect, useMemo, useState } from 'react';
import type { CreateRecruitForm, FaceOption } from '../../../shared/types.ts';
import { archetypeLabel, devLabel, heightFt, recruitPos, spaceOut } from '../lib/format.ts';
import { Stepper } from './EditPlayerModal.tsx';
import FacePickerModal from './FacePickerModal.tsx';
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
  const [gear, setGear] = useState<Record<string, string>>({});
  const [face, setFace] = useState<FaceOption | null>(null);
  const [pickingFace, setPickingFace] = useState(false);

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
        setHomeState(f.states[0] ?? '');
        setDevTrait(f.devTraits[0] ?? 'Normal');
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
        skinTone: skinTone || undefined,
        gear: Object.keys(gear).length ? gear : undefined,
        face: face ?? undefined
      });
      if (res.ok) {
        setSavedNote(`${res.message} Search the board for the name, then stage + to target them, and refine ratings through the profile's EDIT.`);
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
              Honest limits from the save format: they enter unranked (the class's rankings
              belong to real recruits), their pursuit race starts empty (the game
              pre-allocates race lists at class generation and cannot mint new ones),
              commentary will not speak the name, and their in-game appearance borrows the
              template's model. Everything writes to a <strong>…_RJsEdited</strong> copy —
              the original save is never touched.
            </p>
          </InfoDot>
          <button type="button" className="pf-btn ed-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        {state === 'loading' && <div className="pf-wait">Reading the save…</div>}
        {state === 'missing' && <div className="pf-wait">No class to add a recruit to in this save.</div>}
        {state === 'saved' && <div className="ed-saved">{savedNote}</div>}

        {pickingFace && form && (
          <FacePickerModal
            faces={form.faces}
            value={face}
            onPick={(f) => {
              setFace(f);
              // A chosen head carries its native tone — align the visuals tone.
              if (f) setSkinTone(f.tone);
            }}
            onClose={() => setPickingFace(false)}
          />
        )}
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
                <select value={homeState} onChange={(e) => setHomeState(e.target.value)}>
                  {form.states.map((s) => (
                    <option key={s} value={s}>
                      {spaceOut(s)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="ta-field">
                <span>Hometown</span>
                <input value={homeTown} maxLength={form.maxTownLen} onChange={(e) => setHomeTown(e.target.value)} />
              </label>
            </div>

            <div className="ed-sec">Look &amp; gear</div>
            <p className="cr-note">
              Optional — unset choices keep a position-matched base look. Item names are the
              game's own asset identifiers.
            </p>
            <div className="cr-grid">
              <label className="ta-field">
                <span>Face</span>
                <button
                  type="button"
                  className="fp-choose"
                  onClick={() => setPickingFace(true)}
                  title="Pick a head from the catalog; headshots come from your portrait pack"
                >
                  {face ? (
                    <>
                      <FaceThumb face={face} />
                      <span className="fp-choose-label">Tone {face.tone} head</span>
                    </>
                  ) : (
                    <span className="fp-choose-label">Choose face…</span>
                  )}
                </button>
              </label>
              <label className="ta-field">
                <span>Skin tone</span>
                <select value={skinTone} onChange={(e) => setSkinTone(Number(e.target.value))}>
                  <option value={0}>Base look</option>
                  {[...new Set([...form.skinTones, ...(skinTone ? [skinTone] : [])])]
                    .sort((a, b) => a - b)
                    .map((t) => (
                    <option key={t} value={t}>
                      Tone {t}
                    </option>
                  ))}
                </select>
              </label>
              {form.gearSlots.map((g) => {
                // The facemask list locks to what real players wear with the
                // chosen helmet; picking a mask first brings its helmet along.
                const options =
                  g.slot === 'FaceMask' && gear.HeadWear
                    ? (form.helmetMasks[gear.HeadWear] ?? g.options)
                    : g.options;
                return (
                  <label key={g.slot} className="ta-field">
                    <span>{g.label}</span>
                    <select
                      value={gear[g.slot] ?? ''}
                      onChange={(e) =>
                        setGear((prev) => {
                          const next = { ...prev };
                          if (e.target.value) next[g.slot] = e.target.value;
                          else delete next[g.slot];
                          if (g.slot === 'HeadWear') {
                            // A helmet change drops a now-incompatible mask.
                            const allowed = e.target.value ? (form.helmetMasks[e.target.value] ?? []) : null;
                            if (next.FaceMask && allowed && !allowed.includes(next.FaceMask)) {
                              delete next.FaceMask;
                            }
                          }
                          if (g.slot === 'FaceMask' && e.target.value && !next.HeadWear) {
                            const owner = Object.keys(form.helmetMasks).find((h) =>
                              form.helmetMasks[h].includes(e.target.value)
                            );
                            if (owner) next.HeadWear = owner;
                          }
                          return next;
                        })
                      }
                    >
                      <option value="">Base look</option>
                      {options.map((o) => (
                        <option key={o} value={o}>
                          {gearLabel(o)}
                        </option>
                      ))}
                    </select>
                  </label>
                );
              })}
            </div>

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

/** 'GearFaceMask_Speedflex2Bar_WR' → 'Speedflex 2 Bar WR' — the asset id, made readable. */
function gearLabel(asset: string): string {
  return asset
    .replace(/^Gear_?[A-Za-z]*?_/, '')
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([A-Za-z])(\d)/g, '$1 $2');
}

/** Tiny headshot preview for the chosen face; falls back to a tone chip. */
function FaceThumb({ face }: { face: FaceOption }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <span className="fp-thumb-fallback">T{face.tone}</span>;
  return (
    <img
      className="fp-thumb"
      src={`portrait://${face.portraitId}`}
      alt=""
      draggable={false}
      onError={() => setFailed(true)}
    />
  );
}
