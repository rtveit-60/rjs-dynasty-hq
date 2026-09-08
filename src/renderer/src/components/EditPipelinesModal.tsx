import { useEffect, useMemo, useRef, useState } from 'react';
import type { PipelinesForm } from '../../../shared/types.ts';
import { tierForValue } from '../../../shared/pipeline-tiers.ts';
import { useDialog } from '../lib/dialog.ts';
import { Stepper } from './EditPlayerModal.tsx';
import InfoDot from './InfoDot.tsx';

/** Where a freshly added pipeline starts: the Popular floor, the first tier the board counts as an edge. */
const NEW_PIPELINE_TIER = 3;

type Row = {
  pipeline: string;
  label: string;
  region: string;
  value: number;
  /** The save's value, null for a staged add. */
  original: number | null;
};

/**
 * Pipelines editor: the school's recruiting pipelines and how much pull it
 * has in each, straight into the save. Existing pipelines take a new tier or
 * influence value or come off the list; any pipeline the game knows can be
 * added. The tier is written from the value (observed band floors), so the
 * pair stays consistent whichever one the game reads. Writes the <save>_RJ
 * sibling like every other editor — the original is never touched.
 */
export default function EditPipelinesModal({ onClose }: { onClose: () => void }) {
  const [form, setForm] = useState<PipelinesForm | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'missing' | 'writing' | 'saved'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [savedNote, setSavedNote] = useState('');
  const [rows, setRows] = useState<Row[]>([]);
  const [removed, setRemoved] = useState<Set<string>>(new Set());
  const [pick, setPick] = useState('');

  useEffect(() => {
    let alive = true;
    void window.hq
      .getPipelinesForm()
      .then((f) => {
        if (!alive) return;
        if (!f) {
          setState('missing');
          return;
        }
        setForm(f);
        setRows(f.entries.map((e) => ({ pipeline: e.pipeline, label: e.label, region: e.region, value: e.value, original: e.value })));
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

  const onList = useMemo(() => new Set(rows.map((r) => r.pipeline)), [rows]);
  const addable = useMemo(() => (form?.options ?? []).filter((o) => !onList.has(o.pipeline)), [form, onList]);
  const liveCount = rows.filter((r) => !removed.has(r.pipeline)).length;
  const staged = rows.filter((r) => r.original === null).length;
  const removedExisting = [...removed].filter((p) => rows.some((r) => r.pipeline === p && r.original !== null)).length;
  const full = !!form && liveCount >= form.capacity;
  const noRows = !!form && staged - removedExisting >= form.freeRows;

  const setValue = (pipeline: string, value: number): void =>
    setRows((rs) => rs.map((r) => (r.pipeline === pipeline ? { ...r, value } : r)));
  const toggleRemove = (pipeline: string): void =>
    setRemoved((s) => {
      const next = new Set(s);
      if (next.has(pipeline)) next.delete(pipeline);
      else next.add(pipeline);
      return next;
    });
  const dropStaged = (pipeline: string): void => setRows((rs) => rs.filter((r) => r.pipeline !== pipeline));
  const add = (): void => {
    const o = addable.find((x) => x.pipeline === pick);
    if (!o || !form) return;
    const floor = form.levels.find((l) => l.tier === NEW_PIPELINE_TIER)?.floor ?? 0;
    setRows((rs) => [...rs, { pipeline: o.pipeline, label: o.label, region: o.region, value: floor, original: null }]);
    setPick('');
  };

  const changes = useMemo(() => {
    if (!form) return null;
    const set: { pipeline: string; value: number }[] = [];
    for (const r of rows) {
      if (removed.has(r.pipeline)) continue;
      if (r.original === null || r.value !== r.original) set.push({ pipeline: r.pipeline, value: r.value });
    }
    const remove = rows.filter((r) => r.original !== null && removed.has(r.pipeline)).map((r) => r.pipeline);
    if (!set.length && !remove.length) return null;
    return { ...(set.length ? { set } : {}), ...(remove.length ? { remove } : {}) };
  }, [form, rows, removed]);

  const save = async (): Promise<void> => {
    if (!form || !changes) return;
    setState('writing');
    setError(null);
    try {
      const res = await window.hq.editPipelines(changes);
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
        className="ed-panel pl-panel"
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Edit pipelines"
        tabIndex={-1}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="ed-head">
          <span className="ed-title">Pipelines</span>
          {form && <span className="ed-who">{form.school}</span>}
          <InfoDot title="Pipelines">
            <p>
              Your recruiting pipelines and how much pull the program has in each, written straight
              into the save. Every pipeline the game knows can be added; any of yours can be dropped.
            </p>
            <p>
              The tier is the number on the game&apos;s map pin (1 Niche Interest through 5 Cultural
              Pillar). It follows the influence value: picking a tier moves the value to the lowest
              value seen at that tier in real saves, and typing a value re-grades the tier the same
              way. The game keeps no threshold table for this ladder, so the floors are observed, not
              official. The game moves influence on its own as you recruit from a region.
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
        {state === 'missing' && <div className="pf-wait">The game keeps no pipelines for this school.</div>}
        {state === 'saved' && <div className="ed-saved" role="status">{savedNote}</div>}

        {form && (state === 'ready' || state === 'writing') && (
          <>
            <div className="ed-sec pl-sec">
              <span>Your pipelines</span>
              <span className="pl-count">
                {liveCount} of {form.capacity}
              </span>
            </div>
            {!rows.length && <div className="pl-empty">No pipelines yet. Add one below.</div>}
            <div className="pl-list">
              {rows.map((r) => {
                const gone = removed.has(r.pipeline);
                const tier = tierForValue(r.value);
                const changed = r.original !== null && r.value !== r.original;
                return (
                  <div
                    key={r.pipeline}
                    className={`pl-row ${gone ? 'gone' : ''} ${changed || r.original === null ? 'changed' : ''}`}
                  >
                    <span className={`pl-tier t${tier.tier}`} aria-label={`Tier ${tier.tier}`}>
                      {tier.tier}
                    </span>
                    <span className="pl-name">
                      <b>{r.label}</b>
                      {r.original === null && <span className="pl-new">NEW</span>}
                      {r.region && <span className="pl-region">{r.region}</span>}
                    </span>
                    <select
                      className="pl-level"
                      value={tier.level}
                      disabled={gone}
                      aria-label={`${r.label} tier`}
                      onChange={(e) => {
                        const l = form.levels.find((x) => x.level === e.target.value);
                        if (l) setValue(r.pipeline, l.floor);
                      }}
                    >
                      {form.levels.map((l) => (
                        <option key={l.level} value={l.level}>
                          {l.tier} · {l.label}
                        </option>
                      ))}
                    </select>
                    <span className={gone ? 'pl-dim' : ''}>
                      <Stepper
                        value={r.value}
                        min={0}
                        max={form.valueMax}
                        changed={changed}
                        label={`${r.label} influence`}
                        onChange={(v) => setValue(r.pipeline, v)}
                      />
                    </span>
                    {r.original === null ? (
                      <button type="button" className="pf-btn pl-x" onClick={() => dropStaged(r.pipeline)} aria-label={`Drop ${r.label}`}>
                        ✕
                      </button>
                    ) : (
                      <button
                        type="button"
                        className={`pf-btn pl-x ${gone ? 'undo' : ''}`}
                        onClick={() => toggleRemove(r.pipeline)}
                        aria-label={gone ? `Keep ${r.label}` : `Remove ${r.label}`}
                      >
                        {gone ? 'UNDO' : '✕'}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="ed-sec">Add a pipeline</div>
            <div className="pl-add">
              <select value={pick} onChange={(e) => setPick(e.target.value)} aria-label="Pipeline to add" disabled={full || noRows}>
                <option value="">{addable.length ? 'Choose a pipeline…' : 'Every pipeline is on the list'}</option>
                {addable.map((o) => (
                  <option key={o.pipeline} value={o.pipeline}>
                    {o.label}
                    {o.region ? ` — ${o.region}` : ''}
                  </option>
                ))}
              </select>
              <button type="button" className="pf-btn" disabled={!pick || full || noRows} onClick={add}>
                ADD
              </button>
              <span className="pl-hint">
                {full
                  ? 'The list is full.'
                  : noRows
                    ? 'The save has no free pipeline rows left.'
                    : `Starts at tier ${NEW_PIPELINE_TIER}; set the value once it is on the list.`}
              </span>
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
