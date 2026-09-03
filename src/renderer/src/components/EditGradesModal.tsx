import { useEffect, useMemo, useRef, useState } from 'react';
import type { GradesEditForm } from '../../../shared/types.ts';
import { useDialog } from '../lib/dialog.ts';
import { Stepper } from './EditPlayerModal.tsx';
import InfoDot from './InfoDot.tsx';

/** "Aplus" → "A+", "Bminus" → "B−". */
function letter(member: string): string {
  return member.replace('plus', '+').replace('minus', '−');
}

/** 0–10 half-star steps → "3½★". */
function starsText(n: number): string {
  const whole = Math.floor(n / 2);
  return `${whole}${n % 2 ? '½' : ''}★`;
}

/**
 * Program Grades editor: writes the school's ten letters straight into the
 * save's tracking row, plus the star prestige the game shows on the program.
 * Each letter carries how long it survives before the game recomputes it
 * (two are permanent, six refresh weekly, two at the offseason); the stars
 * are re-derived each offseason. Writes the <save>_RJ sibling like every
 * other editor — the original is never touched.
 */
export default function EditGradesModal({ onClose }: { onClose: () => void }) {
  const [form, setForm] = useState<GradesEditForm | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'missing' | 'writing' | 'saved'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [savedNote, setSavedNote] = useState('');
  const [grades, setGrades] = useState<Record<string, string>>({});
  const [prestige, setPrestige] = useState(0);

  useEffect(() => {
    let alive = true;
    void window.hq
      .getGradesForm()
      .then((f) => {
        if (!alive) return;
        if (!f) {
          setState('missing');
          return;
        }
        setForm(f);
        setGrades(Object.fromEntries(f.grades.map((g) => [g.field, g.grade])));
        setPrestige(f.prestige);
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

  const changes = useMemo(() => {
    if (!form) return null;
    const out: { grades?: Record<string, string>; prestige?: number } = {};
    const changed: Record<string, string> = {};
    for (const g of form.grades) if (grades[g.field] && grades[g.field] !== g.grade) changed[g.field] = grades[g.field];
    if (Object.keys(changed).length) out.grades = changed;
    if (prestige !== form.prestige) out.prestige = prestige;
    return out.grades || out.prestige !== undefined ? out : null;
  }, [form, grades, prestige]);

  const save = async (): Promise<void> => {
    if (!form || !changes) return;
    setState('writing');
    setError(null);
    try {
      const res = await window.hq.editGrades(changes);
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
        className="ed-panel gr-panel"
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Edit program grades"
        tabIndex={-1}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="ed-head">
          <span className="ed-title">Program Grades</span>
          {form && <span className="ed-who">{form.school}</span>}
          <InfoDot title="Program grades">
            <p>
              Sets the ten letters the game grades your program on, straight into the save. The
              game recomputes them on its own schedule, so each row says how long a written letter
              lasts: <strong>Permanent</strong> letters are never touched again,{' '}
              <strong>Until next week</strong> letters are re-graded when the week advances, and{' '}
              <strong>Until offseason</strong> letters hold through the season.
            </p>
            <p>
              Prestige is the program's star rating in half-star steps (0–5★). The game re-derives
              it each offseason from the weighted letters — Championship Contender, Pro Potential
              and Brand Exposure count most — so a written value holds until then.
            </p>
            <p>
              The change is written to a separate <strong>…_RJ</strong> copy of your save — the
              original is never modified — and the dashboard follows the copy.
            </p>
          </InfoDot>
          <button type="button" className="pf-btn ed-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        {state === 'loading' && <div className="pf-wait">Reading the save…</div>}
        {state === 'missing' && <div className="pf-wait">The game keeps no program grades for this school.</div>}
        {state === 'saved' && <div className="ed-saved" role="status">{savedNote}</div>}

        {form && (state === 'ready' || state === 'writing') && (
          <>
            <div className="ed-sec">Letters</div>
            <div className="gr-grid">
              {form.grades.map((g) => {
                const cur = grades[g.field] ?? g.grade;
                return (
                  <label key={g.field} className={`gr-row ${cur !== g.grade ? 'changed' : ''}`}>
                    <span className="gr-lbl">{g.label}</span>
                    <select value={cur} onChange={(e) => setGrades((s) => ({ ...s, [g.field]: e.target.value }))}>
                      {!form.gradeOptions.includes(cur) && <option value={cur}>{letter(cur)}</option>}
                      {form.gradeOptions.map((o) => (
                        <option key={o} value={o}>
                          {letter(o)}
                        </option>
                      ))}
                    </select>
                    <span className={`gr-life ${g.lifetime === 'Permanent' ? 'perm' : ''}`}>{g.lifetime}</span>
                  </label>
                );
              })}
            </div>

            <div className="ed-sec">Prestige</div>
            <div className="gr-stars">
              <Stepper
                value={prestige}
                min={0}
                max={form.prestigeMax}
                changed={prestige !== form.prestige}
                label="Prestige in half stars"
                onChange={setPrestige}
              />
              <span className="gr-stars-v">{starsText(prestige)}</span>
              <span className="gr-life">Until offseason · rank #{form.prestigeRank || '—'}</span>
            </div>

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
                disabled={!changes || state === 'writing'}
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
