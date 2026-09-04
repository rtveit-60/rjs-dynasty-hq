import { useEffect, useRef, useState } from 'react';
import type { FacilitiesForm } from '../../../shared/types.ts';
import { useDialog } from '../lib/dialog.ts';
import InfoDot from './InfoDot.tsx';

/** "Aplus" → "A+", "Bminus" → "B−". */
function letter(member: string): string {
  return member ? member.replace('plus', '+').replace('minus', '−') : '—';
}

/**
 * Facilities editor: the school's athletic-facility level, set by the game's
 * own five tiers. The renewal reserve follows the level as the game keeps
 * it; owned equipment is listed for context (the level's slot cap holds);
 * the Athletic Facilities letter re-grades weekly from the level's band and
 * the equipment bonus, so it is shown, not written. No program points move —
 * a free sandbox by design. Writes the <save>_RJ sibling like every editor.
 */
export default function FacilitiesModal({ onClose }: { onClose: () => void }) {
  const [form, setForm] = useState<FacilitiesForm | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'missing' | 'writing' | 'saved'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [savedNote, setSavedNote] = useState('');
  const [level, setLevel] = useState(0);

  useEffect(() => {
    let alive = true;
    void window.hq
      .getFacilitiesForm()
      .then((f) => {
        if (!alive) return;
        if (!f) {
          setState('missing');
          return;
        }
        setForm(f);
        setLevel(f.level);
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

  const panelRef = useRef<HTMLDivElement>(null);
  useDialog(panelRef);

  const chosen = form?.levels.find((l) => l.level === level) ?? null;
  const owned = form?.equipment.length ?? 0;
  const overCap = chosen ? owned > chosen.slotCap : false;
  const changed = form ? level !== form.level : false;

  const save = async (): Promise<void> => {
    if (!form || !changed || overCap) return;
    setState('writing');
    setError(null);
    try {
      const res = await window.hq.editFacilities({ level });
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
      <div
        className="ed-panel fc-panel"
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Facilities"
        tabIndex={-1}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="ed-head">
          <span className="ed-title">Facilities</span>
          {form && <span className="ed-who">{form.school}</span>}
          <InfoDot title="Facilities">
            <p>
              Sets your athletic facility to one of the game's five levels: Basic, Competitive, Premier, Elite,
              National Powerhouse. Each level pins the Athletic Facilities letter to a band, opens one more
              equipment slot, and carries a renewal fee the game reserves each season — the reserve follows
              the level here just as it does in the game.
            </p>
            <p>
              The letter itself is re-graded by the game every week from the level's band plus the bonus of
              any grade-boosting equipment you own, so it is shown for context rather than written.
              Equipment is listed but edited in the game; a level cannot drop below the slots your equipment
              already fills.
            </p>
            <p>
              No program points are charged. The change is written to a separate <strong>…_RJ</strong> copy
              of your save — the original is never modified — and the dashboard follows the copy.
            </p>
          </InfoDot>
          <button type="button" className="pf-btn ed-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        {state === 'loading' && <div className="pf-wait">Reading the save…</div>}
        {state === 'missing' && <div className="pf-wait">This save carries no facilities data for the school.</div>}
        {state === 'saved' && <div className="ed-saved" role="status">{savedNote}</div>}

        {form && (state === 'ready' || state === 'writing') && (
          <>
            <div className="rs-now">
              <div className="rs-stat">
                <span className="rs-k">Level</span>
                <span className="rs-v">{form.levels.find((l) => l.level === form.level)?.name ?? form.level}</span>
              </div>
              <div className="rs-stat">
                <span className="rs-k">Facilities grade</span>
                <span className="rs-v">{letter(form.grade)}</span>
              </div>
              <div className="rs-stat">
                <span className="rs-k">Renewal reserved</span>
                <span className="rs-v">{form.renewReserved.toLocaleString()}</span>
              </div>
            </div>

            <div className="ed-sec">Facility level</div>
            <div className="fc-levels" role="radiogroup" aria-label="Facility level">
              {form.levels.map((l) => {
                const on = l.level === level;
                const tooSmall = owned > l.slotCap;
                return (
                  <button
                    key={l.level}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    className={`fc-level ${on ? 'on' : ''} ${l.level === form.level ? 'current' : ''} ${tooSmall ? 'blocked' : ''}`}
                    onClick={() => setLevel(l.level)}
                    title={tooSmall ? `${l.name} holds ${l.slotCap} equipment slot${l.slotCap === 1 ? '' : 's'}; you own ${owned}.` : l.desc || undefined}
                  >
                    <span className="fc-tier">{l.level}</span>
                    <span className="fc-name">{l.name}</span>
                    <span className="fc-meta">
                      {letter(l.bestGrade) === letter(l.worstGrade)
                        ? `Grade ${letter(l.bestGrade)}`
                        : `${letter(l.worstGrade)} – ${letter(l.bestGrade)}`}
                      {' · '}
                      {l.slotCap} slot{l.slotCap === 1 ? '' : 's'}
                      {' · '}renew {l.renewCost}
                    </span>
                    {l.level === form.level && <span className="fc-now">CURRENT</span>}
                  </button>
                );
              })}
            </div>
            {chosen && chosen.desc && <div className="fc-desc">{chosen.desc}</div>}
            {overCap && chosen && (
              <div className="ed-error" role="alert">
                {chosen.name} allows {chosen.slotCap} equipment slot{chosen.slotCap === 1 ? '' : 's'} and this school owns {owned}.
                Sell equipment in the game before dropping to this level.
              </div>
            )}

            <div className="ed-sec">Equipment owned</div>
            {form.equipment.length ? (
              <div className="fc-equip">
                {form.equipment.map((e, i) => (
                  <div key={i} className="fc-item">
                    <span className="fc-item-name">{e.name}</span>
                    <span className="fc-item-eff">
                      {e.effect}
                      {e.value ? ` +${e.value}` : ''}
                    </span>
                    <span className="fc-item-meta">
                      {e.cost} pts · {e.weeksOwned} wk{e.weeksOwned === 1 ? '' : 's'}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="fc-none">No equipment owned. Equipment is bought in the game's Facilities screen.</div>
            )}

            {error && <div className="ed-error" role="alert">{error}</div>}

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
                disabled={!changed || overCap || state === 'writing'}
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
