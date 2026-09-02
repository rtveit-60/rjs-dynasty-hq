import { useEffect, useMemo, useRef, useState } from 'react';
import type { CoachEditChanges, CoachEditForm } from '../../../shared/types.ts';
import { coachTalentTree, type CoachTalentSubTree } from '../../../shared/coach-talents.ts';
import {
  TALENT_LOCKED,
  costDelta,
  ownedSet,
  withNodeOwned,
  withNodeReleased
} from '../../../shared/coach-talent-logic.ts';
import InfoDot from './InfoDot.tsx';
import { useDialog } from '../lib/dialog.ts';
import { heightFt } from '../lib/format.ts';
import { Stepper } from './EditPlayerModal.tsx';

type CoachTab = 'base' | 'profile' | 'progression';
const TABS: { key: CoachTab; label: string }[] = [
  { key: 'base', label: 'BASE VALUES' },
  { key: 'profile', label: 'COACH PROFILE' },
  { key: 'progression', label: 'COACH PROGRESSION' }
];

const ROLE_LABEL: Record<string, string> = {
  HeadCoach: 'Head Coach',
  OffensiveCoordinator: 'Offensive Coordinator',
  DefensiveCoordinator: 'Defensive Coordinator'
};
const words = (id: string): string => id.replace(/_/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2');

/** The save's own security bands: the status a percentage lands in. */
function securityStatusFor(pct: number, bands: CoachEditForm['securityBands']): string {
  if (pct <= bands.hotSeat) return 'HotSeat';
  if (pct <= bands.low) return 'Low';
  if (pct <= bands.safeForNow) return 'SafeForNow';
  return 'Safe';
}

/**
 * The Edit Coach dialog, opened from a coach profile's EDIT control. Three
 * tabs: Base Values (points, level, prestige score, XP, job security), Coach
 * Profile (identity, role, measurables, look) and Coach Progression
 * (archetype, backstory, Expert Scout, and the talent trees node by node).
 * Writes go to the <save>_RJsEdited sibling like every other edit.
 */
export default function EditCoachModal({ coachRow, onClose }: { coachRow: number; onClose: () => void }) {
  const [form, setForm] = useState<CoachEditForm | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'missing' | 'writing' | 'saved'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [savedTo, setSavedTo] = useState('');
  const [tab, setTab] = useState<CoachTab>('base');

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [position, setPosition] = useState('');
  const [coachPoints, setCoachPoints] = useState(0);
  const [level, setLevel] = useState(0);
  const [prestigeScore, setPrestigeScore] = useState(0);
  const [xp, setXp] = useState(0);
  const [securityPct, setSecurityPct] = useState(0);
  const [age, setAge] = useState(40);
  const [heightIn, setHeightIn] = useState(72);
  const [weightLb, setWeightLb] = useState(200);
  const [homeState, setHomeState] = useState('');
  const [demeanor, setDemeanor] = useState('');
  const [stance, setStance] = useState('');
  const [hat, setHat] = useState('');
  const [bodyType, setBodyType] = useState('');
  const [archetype, setArchetype] = useState(0);
  const [backstory, setBackstory] = useState(0);
  const [expertScout, setExpertScout] = useState(false);
  const [owned, setOwned] = useState<Record<number, Set<number>>>({});
  const [openSlot, setOpenSlot] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    void window.hq
      .getCoachEditForm(coachRow)
      .then((f) => {
        if (!alive) return;
        if (!f) {
          setState('missing');
          return;
        }
        setForm(f);
        setFirstName(f.firstName);
        setLastName(f.lastName);
        setPosition(f.position);
        setCoachPoints(f.coachPoints);
        setLevel(f.level);
        setPrestigeScore(f.prestigeScore);
        setXp(f.xp);
        setSecurityPct(f.securityPct);
        setAge(f.age);
        setHeightIn(f.heightIn);
        setWeightLb(f.weightLb);
        setHomeState(f.homeState);
        setDemeanor(f.demeanor);
        setStance(f.stance);
        setHat(f.hat);
        setBodyType(f.bodyType);
        setArchetype(f.archetype);
        setBackstory(f.backstory);
        setExpertScout(f.expertScout);
        setOwned(Object.fromEntries((f.tree ?? []).map((s) => [s.slot, ownedSet(s.status)])));
        setState('ready');
      })
      .catch(() => alive && setState('missing'));
    return () => {
      alive = false;
    };
  }, [coachRow]);

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

  /** Tree definitions follow the coach's current role; a role change re-reads them after the save. */
  const tree: CoachTalentSubTree[] = useMemo(() => (form ? coachTalentTree(form.position) : []), [form]);
  const slotState = (slot: number) => form?.tree?.find((s) => s.slot === slot) ?? null;
  const rootOwned = (slot: number): boolean => owned[slot]?.has(0) ?? false;

  const toggleNode = (slot: number, index: number): void => {
    const sub = tree[slot];
    if (!sub) return;
    setOwned((prev) => {
      const cur = prev[slot] ?? new Set<number>();
      const next = cur.has(index) ? withNodeReleased(sub, cur, index) : withNodeOwned(sub, cur, index);
      return { ...prev, [slot]: next };
    });
  };

  const changes: CoachEditChanges | null = useMemo(() => {
    if (!form) return null;
    const out: CoachEditChanges = { coachRow: form.coachRow };
    let any = false;
    const set = <K extends keyof CoachEditChanges>(k: K, v: CoachEditChanges[K], was: unknown): void => {
      if (v !== was) {
        out[k] = v;
        any = true;
      }
    };
    set('firstName', firstName.trim(), form.firstName);
    set('lastName', lastName.trim(), form.lastName);
    set('position', position, form.position);
    set('coachPoints', coachPoints, form.coachPoints);
    set('level', level, form.level);
    set('prestigeScore', prestigeScore, form.prestigeScore);
    set('xp', xp, form.xp);
    set('securityPct', securityPct, form.securityPct);
    set('age', age, form.age);
    set('heightIn', heightIn, form.heightIn);
    set('weightLb', weightLb, form.weightLb);
    set('homeState', homeState, form.homeState);
    set('demeanor', demeanor, form.demeanor);
    set('stance', stance, form.stance);
    set('hat', hat, form.hat);
    set('bodyType', bodyType, form.bodyType);
    set('archetype', archetype, form.archetype);
    set('backstory', backstory, form.backstory);
    set('expertScout', expertScout, form.expertScout);
    const talents: { slot: number; owned: number[] }[] = [];
    for (const s of form.tree ?? []) {
      const before = ownedSet(s.status);
      const after = owned[s.slot] ?? before;
      const same = before.size === after.size && [...before].every((i) => after.has(i));
      if (!same) talents.push({ slot: s.slot, owned: [...after].sort((a, b) => a - b) });
    }
    if (talents.length) {
      out.talents = talents;
      any = true;
    }
    return any ? out : null;
  }, [
    form, firstName, lastName, position, coachPoints, level, prestigeScore, xp, securityPct, age, heightIn, weightLb,
    homeState, demeanor, stance, hat, bodyType, archetype, backstory, expertScout, owned
  ]);

  const problem = !form
    ? null
    : !firstName.trim() || !lastName.trim()
      ? 'Names cannot be empty.'
      : firstName.trim().length > form.maxFirstLen
        ? `First name is capped at ${form.maxFirstLen} characters by the save format.`
        : lastName.trim().length > form.maxLastLen
          ? `Last name is capped at ${form.maxLastLen} characters by the save format.`
          : !rootOwnedForArchetype(archetype)
            ? `Own the ${archetypeName(archetype)} archetype node before making it the dominant archetype.`
            : null;

  function archetypeName(value: number): string {
    return form?.archetypeOptions.find((o) => o.value === value)?.name ?? String(value);
  }
  function rootOwnedForArchetype(value: number): boolean {
    if (!form || value === form.archetype) return true;
    const sub = tree.find((s) => s.archetype === value);
    return !!sub && rootOwned(sub.slot);
  }

  const pointsDelta = useMemo(() => {
    if (!form?.tree) return 0;
    let d = 0;
    for (const s of form.tree) {
      const sub = tree[s.slot];
      if (!sub) continue;
      d += costDelta(sub, ownedSet(s.status), owned[s.slot] ?? ownedSet(s.status));
    }
    return d;
  }, [form, tree, owned]);

  const dirty = useMemo<Set<CoachTab>>(() => {
    const s = new Set<CoachTab>();
    if (!changes) return s;
    if (['coachPoints', 'level', 'prestigeScore', 'xp', 'securityPct'].some((k) => k in changes)) s.add('base');
    if (
      ['firstName', 'lastName', 'position', 'age', 'heightIn', 'weightLb', 'homeState', 'demeanor', 'stance', 'hat', 'bodyType']
        .some((k) => k in changes)
    ) s.add('profile');
    if (['archetype', 'backstory', 'expertScout', 'talents'].some((k) => k in changes)) s.add('progression');
    return s;
  }, [changes]);

  const save = async (): Promise<void> => {
    if (!changes || problem) return;
    setState('writing');
    setError(null);
    try {
      const res = await window.hq.editCoach(changes);
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

  const swapPartner = form && position !== form.position ? form.staff.find((s) => s.position === position) ?? null : null;
  /** The schema's members, plus the coach's current value when it is one the list filters out. */
  const selectOptions = (ids: string[], current: string) =>
    (current && !ids.includes(current) ? [current, ...ids] : current ? ids : ['', ...ids]).map((id) => (
      <option key={id} value={id}>
        {id ? words(id) : '— unset —'}
      </option>
    ));

  return (
    <div className="ed-overlay" onMouseDown={onClose}>
      <div
        className="ed-panel ed-panel-wide"
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={form ? `Edit ${form.name}` : 'Edit coach'}
        tabIndex={-1}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="ed-head">
          <span className="ed-title">Edit Coach</span>
          {form && (
            <span className="ed-who">
              {form.name} · {ROLE_LABEL[form.position] ?? words(form.position)}
              {form.teamName ? ` · ${form.teamName}` : ''}
            </span>
          )}
          <InfoDot title="Editing a coach">
            <p>
              Edits are written to a separate copy of your dynasty save named <strong>…_RJsEdited</strong>; the
              original file is never modified and the dashboard follows the edited copy from then on.
            </p>
            <p>
              Prestige is edited as the score; the game re-derives the letter grade from it. Job security
              status follows the percentage using this save's own bands. Changing a coach's role swaps them
              with whoever holds that role on the same staff.
            </p>
            <p>
              Talent nodes can be owned or released freely: owning a node also owns the nodes above it, and
              releasing one releases everything below it. The subtree's paid-points ledger moves with the
              change; the coach's spendable points do not (edit them on Base Values). The game evaluates
              archetype prerequisites itself and may relock a subtree whose requirement is not met.
            </p>
          </InfoDot>
          <button type="button" className="pf-btn ed-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        {state === 'loading' && <div className="pf-wait">Reading the save…</div>}
        {state === 'missing' && <div className="pf-wait">Nothing editable in the save for this coach.</div>}
        {state === 'saved' && (
          <div className="ed-saved" role="status">
            <div className="ed-saved-name">{savedTo}</div>
            Saved. The dashboard now follows the edited copy — load it in the game to play with the change.
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

            {tab === 'base' && (
              <>
                <div className="ed-sec">Base values</div>
                <div className="ed-base">
                  <label>
                    <span>Coach points</span>
                    <Stepper value={coachPoints} min={0} max={form.coachPointsMax} changed={coachPoints !== form.coachPoints} label="Coach points" onChange={setCoachPoints} />
                    <small>Unspent balance.</small>
                  </label>
                  <label>
                    <span>Level</span>
                    <Stepper value={level} min={0} max={form.levelMax} changed={level !== form.level} label="Level" onChange={setLevel} />
                    <small>Sets the number alone; no points are granted.</small>
                  </label>
                  <label>
                    <span>Prestige score</span>
                    <Stepper value={prestigeScore} min={0} max={form.prestigeScoreMax} changed={prestigeScore !== form.prestigeScore} label="Prestige score" onChange={setPrestigeScore} />
                    <small>Letter now: <b>{form.prestigeLetter.replace(/plus$/, '+').replace(/minus$/, '−')}</b> — the game re-grades from the score.</small>
                  </label>
                  <label>
                    <span>Experience points</span>
                    <Stepper value={xp} min={0} max={form.xpMax} changed={xp !== form.xp} label="Experience points" onChange={setXp} />
                    <small>Progress within the current level, as the save keeps it.</small>
                  </label>
                  <label>
                    <span>Job security %</span>
                    <Stepper value={securityPct} min={0} max={100} changed={securityPct !== form.securityPct} label="Job security percent" onChange={setSecurityPct} />
                    <small>
                      Status: <b>{words(securityStatusFor(securityPct, form.securityBands))}</b>
                      {securityStatusFor(securityPct, form.securityBands) !== form.securityStatus ? ` (was ${words(form.securityStatus)})` : ''}
                    </small>
                  </label>
                </div>
              </>
            )}

            {tab === 'profile' && (
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
                  <label>
                    <span>Position</span>
                    <select value={position} onChange={(e) => setPosition(e.target.value)}>
                      {form.positionOptions.map((p) => (
                        <option key={p} value={p}>
                          {ROLE_LABEL[p] ?? words(p)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="ed-measure">
                    <span>Age</span>
                    <Stepper value={age} min={20} max={form.ageMax} changed={age !== form.age} label="Age" onChange={setAge} />
                  </label>
                  <label className="ed-measure">
                    <span>Height (in)</span>
                    <span>
                      <Stepper value={heightIn} min={60} max={84} changed={heightIn !== form.heightIn} label="Height in inches" onChange={setHeightIn} />
                      <span className="ed-ft" aria-live="polite">{heightFt(heightIn)}</span>
                    </span>
                  </label>
                  <label className="ed-measure">
                    <span>Weight (lb)</span>
                    <Stepper value={weightLb} min={form.weightMin} max={form.weightMax} changed={weightLb !== form.weightLb} label="Weight in pounds" onChange={setWeightLb} />
                  </label>
                  <label>
                    <span>Home state</span>
                    <select value={homeState} onChange={(e) => setHomeState(e.target.value)}>
                      {selectOptions(form.homeStateOptions, homeState)}
                    </select>
                  </label>
                  <label>
                    <span>Demeanor</span>
                    <select value={demeanor} onChange={(e) => setDemeanor(e.target.value)}>
                      {selectOptions(form.demeanorOptions, demeanor)}
                    </select>
                  </label>
                  <label>
                    <span>Stance</span>
                    <select value={stance} onChange={(e) => setStance(e.target.value)}>
                      {selectOptions(form.stanceOptions, stance)}
                    </select>
                  </label>
                  <label>
                    <span>Hat</span>
                    <select value={hat} onChange={(e) => setHat(e.target.value)}>
                      {selectOptions(form.hatOptions, hat)}
                    </select>
                  </label>
                  <label>
                    <span>Body type</span>
                    <select value={bodyType} onChange={(e) => setBodyType(e.target.value)}>
                      {selectOptions(form.bodyTypeOptions, bodyType)}
                    </select>
                  </label>
                </div>
                {position !== form.position && (
                  <p className="ed-warn" role="status">
                    {swapPartner
                      ? `Role change: ${swapPartner.name} moves to ${ROLE_LABEL[form.position] ?? form.position} in the same save. Talent trees differ between head coaches and coordinators; a coordinator promoted to head coach gets the two head-coach specialties locked until their prerequisites are met. Play or sim a week afterwards to confirm the staff took.`
                      : `Role change with no one to swap: this staff has no ${ROLE_LABEL[position] ?? position}. The role is written directly.`}
                  </p>
                )}
              </>
            )}

            {tab === 'progression' && (
              <>
                <div className="ed-sec">Archetype &amp; backstory</div>
                <div className="ed-identity">
                  <label>
                    <span>Dominant archetype</span>
                    <select value={archetype} onChange={(e) => setArchetype(Number(e.target.value))}>
                      {form.archetypeOptions.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.name}
                          {rootOwnedForArchetype(o.value) ? '' : ' (archetype node not owned)'}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>Backstory</span>
                    <select value={backstory} onChange={(e) => setBackstory(Number(e.target.value))}>
                      {form.backstoryOptions.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <div className="ed-sec">Unlocks</div>
                <div className="ed-toggles">
                  <label className="ed-toggle">
                    <input type="checkbox" checked={expertScout} onChange={(e) => setExpertScout(e.target.checked)} />
                    <span>Expert Scout</span>
                    <small>The coach's Expert Scout trait flag.</small>
                  </label>
                  {tree
                    .filter((s) => s.archetype === 12 || s.archetype === 11)
                    .map((s) => (
                      <label key={s.slot} className="ed-toggle">
                        <input
                          type="checkbox"
                          checked={rootOwned(s.slot)}
                          disabled={!slotState(s.slot)}
                          onChange={() => toggleNode(s.slot, 0)}
                        />
                        <span>{s.name}</span>
                        <small>{s.prereq?.desc || s.desc}</small>
                      </label>
                    ))}
                </div>

                <div className="ed-sec">Talent trees</div>
                {!form.tree ? (
                  <p className="cr-note">This coach has no talent tree in the save.</p>
                ) : (
                  <div className="ed-tree">
                    {tree.map((s) => {
                      const st = slotState(s.slot);
                      const cur = owned[s.slot] ?? new Set<number>();
                      const locked = !!st && st.status[0] === TALENT_LOCKED && !cur.has(0);
                      const open = openSlot === s.slot;
                      return (
                        <div key={s.slot} className={`ed-sub ${open ? 'open' : ''}`}>
                          <button
                            type="button"
                            className="ed-sub-head"
                            aria-expanded={open}
                            disabled={!st}
                            onClick={() => setOpenSlot(open ? null : s.slot)}
                          >
                            <span className="ed-sub-name">{s.name}</span>
                            <span className="ed-sub-meta">
                              {s.type}
                              {locked ? ' · locked' : ''}
                              {s.prereq?.desc ? ` · ${s.prereq.desc}` : ''}
                            </span>
                            <span className="ed-sub-count">
                              {cur.size}/{s.nodes.length}
                            </span>
                          </button>
                          {open && st && (
                            <div className="ed-nodes">
                              {s.nodes.map((n) => (
                                <label
                                  key={n.index}
                                  className={`ed-node lvl-${n.level} ${cur.has(n.index) ? 'owned' : ''}`}
                                  title={n.desc}
                                >
                                  <input type="checkbox" checked={cur.has(n.index)} onChange={() => toggleNode(s.slot, n.index)} />
                                  <span className="ed-node-name">
                                    {n.index === 0 ? `${n.name || s.name} (archetype)` : n.name}
                                    {n.branch ? <em> · {n.branch}</em> : null}
                                  </span>
                                  <span className="ed-node-cost">{n.cost}</span>
                                  <span className="ed-node-desc">{n.desc}</span>
                                </label>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                    <div className="ed-sp">
                      <span className="ed-sp-label">Ledger</span>
                      <span className="ed-sp-note">
                        {pointsDelta === 0
                          ? 'No change to points spent.'
                          : pointsDelta > 0
                            ? `+${pointsDelta} points recorded as spent. Spendable points are not deducted.`
                            : `${pointsDelta} points taken off the spent ledger. Spendable points are not refunded.`}
                      </span>
                    </div>
                  </div>
                )}
              </>
            )}

            {(error || problem) && <div className="ed-error" role="alert">{error ?? problem}</div>}

            <div className="ed-foot">
              <span className="ed-target">
                Writes <strong>{form.targetFileName}</strong>
                {form.targetExists ? ' (replaces the existing edited copy; a backup is kept)' : ''} — the original
                save is never touched.
              </span>
              <button type="button" className="pf-btn" onClick={onClose}>
                Cancel
              </button>
              <button
                type="button"
                className="btn primary ed-save"
                disabled={!changes || !!problem || state === 'writing'}
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
