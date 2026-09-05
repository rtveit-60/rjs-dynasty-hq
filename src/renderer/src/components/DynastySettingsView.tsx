import { useCallback, useEffect, useMemo, useState } from 'react';
import type { DynastySettingsForm, SettingField, SettingsGroup } from '../../../shared/types.ts';
import { useHQ } from '../store.ts';
import { Stepper } from './EditPlayerModal.tsx';
import InfoDot, { InfoRow } from './InfoDot.tsx';
import SettingScale from './SettingScale.tsx';

type Value = number | boolean | string;

const TABS: { key: SettingsGroup['key']; label: string }[] = [
  { key: 'gameplay', label: 'GAMEPLAY' },
  { key: 'xp', label: 'XP' },
  { key: 'league', label: 'LEAGUE' }
];

function Field({
  f,
  value,
  onChange
}: {
  f: SettingField;
  value: Value;
  onChange: (v: Value) => void;
}) {
  const changed = value !== f.value;
  const locked = f.locked === true;
  const scale = f.kind === 'int' && !locked;
  return (
    <div className={`ds-field ${scale ? 'has-scale' : ''} ${changed ? 'changed' : ''} ${locked ? 'locked' : ''}`}>
      <div className="ds-lbl">
        <span>{f.label}</span>
        {f.note && <span className="ds-note">{f.note}</span>}
      </div>
      <div className="ds-ctl">
        {f.kind === 'int' &&
          (locked ? (
            <span className="ds-ro">{String(value)}</span>
          ) : (
            <Stepper
              value={Number(value)}
              min={f.min ?? 0}
              max={f.max ?? 100}
              changed={changed}
              label={f.label}
              onChange={(n) => onChange(n)}
            />
          ))}
        {f.kind === 'bool' && (
          <button
            type="button"
            role="switch"
            aria-checked={value === true}
            aria-label={f.label}
            className={`ds-toggle ${value === true ? 'on' : ''}`}
            disabled={locked}
            onClick={() => onChange(!(value === true))}
          >
            <span className="ds-knob" />
            <span className="ds-state">{value === true ? 'ON' : 'OFF'}</span>
          </button>
        )}
        {f.kind === 'enum' &&
          (locked ? (
            <span className="ds-ro">{f.options?.find((o) => o.id === value)?.name ?? String(value)}</span>
          ) : (
            <select value={String(value)} aria-label={f.label} onChange={(e) => onChange(e.target.value)}>
              {f.options?.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          ))}
      </div>
      {scale && (
        <SettingScale
          value={Number(value)}
          min={f.min ?? 0}
          max={f.max ?? 100}
          changed={changed}
          label={`${f.label} scale`}
          onChange={(n) => onChange(n)}
        />
      )}
    </div>
  );
}

/**
 * Dynasty Settings: the game's gameplay, XP and league sliders read straight
 * from the save and written back through the same guarded <save>_RJ path as
 * every other editor. Settings the game fixes after creation are shown
 * read-only; Quarter Length is held read-only until its mechanism is settled.
 */
export default function DynastySettingsView() {
  const snapshot = useHQ((s) => s.snapshot);
  const [form, setForm] = useState<DynastySettingsForm | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'missing' | 'writing'>('loading');
  const [tab, setTab] = useState<SettingsGroup['key']>('gameplay');
  const [values, setValues] = useState<Record<string, Value>>({});
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(() => {
    let alive = true;
    setState('loading');
    void window.hq
      .getSettingsForm()
      .then((f) => {
        if (!alive) return;
        if (!f) {
          setState('missing');
          return;
        }
        setForm(f);
        setValues({});
        setState('ready');
      })
      .catch(() => alive && setState('missing'));
    return () => {
      alive = false;
    };
  }, []);

  // Re-read whenever the save refreshes, so the page never shows stale values.
  useEffect(() => load(), [load, snapshot?.parsedAt]);

  const fieldsById = useMemo(() => {
    const m = new Map<string, SettingField>();
    for (const g of form?.groups ?? []) for (const s of g.sections) for (const f of s.fields) m.set(f.id, f);
    return m;
  }, [form]);

  const pending = useMemo(() => {
    const out: Record<string, Value> = {};
    for (const [id, v] of Object.entries(values)) {
      const f = fieldsById.get(id);
      if (f && v !== f.value) out[id] = v;
    }
    return out;
  }, [values, fieldsById]);
  const pendingCount = Object.keys(pending).length;
  const pendingByTab = useMemo(() => {
    const m: Record<string, number> = {};
    for (const g of form?.groups ?? []) {
      m[g.key] = g.sections.reduce((n, s) => n + s.fields.filter((f) => pending[f.id] !== undefined).length, 0);
    }
    return m;
  }, [form, pending]);

  const save = async (): Promise<void> => {
    if (!pendingCount) return;
    setState('writing');
    setError(null);
    setNote(null);
    try {
      const res = await window.hq.editSettings({ values: pending });
      if (res.ok) {
        setNote(res.message);
        setValues({});
        setState('ready');
      } else {
        setError(res.message);
        setState('ready');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setState('ready');
    }
  };

  const group = form?.groups.find((g) => g.key === tab) ?? null;

  return (
    <div className="page ds-page">
      <div className="page-kicker">League Office</div>
      <h1 className="page-title">
        Dynasty Settings
        <InfoDot title="Dynasty settings">
          <p>
            The game's own gameplay, XP and league settings, read from your save and written back
            to the <strong>…_RJ</strong> copy — the original is never touched. Load the copy in the
            game to play with the changes.
          </p>
          <InfoRow term="Player / CPU Skill">The two skill slider rows the game keeps: yours and the CPU's.</InfoRow>
          <InfoRow term="Read-only rows">
            Settings the game fixes when a dynasty is created (Coach Level Purchases, Pre-Order
            bonuses) are shown but not editable. Quarter Length is set in-game by the player and is
            held read-only for now.
          </InfoRow>
          <InfoRow term="Your Program">Your school's own season settings (auto-progression, weekly training, CPU assists).</InfoRow>
        </InfoDot>
      </h1>
      <div className="page-sub">Gameplay sliders, progression speed and league rules, straight from the save.</div>

      <div className="tabs ds-tabs">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            className={`tab ${tab === t.key ? 'active' : ''}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
            {pendingByTab[t.key] ? <span className="ds-dot" aria-label={`${pendingByTab[t.key]} unsaved`} /> : null}
          </button>
        ))}
      </div>

      {state === 'loading' && !form && <div className="empty">Reading the save…</div>}
      {state === 'missing' && <div className="empty">This save carries no settings the app can read.</div>}

      {group && (
        <div className="ds-sections">
          {group.sections.map((s) => (
            <section key={s.title} className="panel ds-section">
              <div className="panel-title">{s.title}</div>
              {s.note && <div className="ds-section-note">{s.note}</div>}
              <div className="ds-grid">
                {s.fields.map((f) => (
                  <Field
                    key={f.id}
                    f={f}
                    value={values[f.id] ?? f.value}
                    onChange={(v) => setValues((cur) => ({ ...cur, [f.id]: v }))}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {form && (
        <div className={`dc-savebar ds-savebar ${pendingCount ? 'live' : ''}`}>
          <span className="dc-save-note">
            {error ? (
              <span className="ed-error-inline" role="alert">{error}</span>
            ) : note && !pendingCount ? (
              <span role="status">{note}</span>
            ) : pendingCount ? (
              <>
                <strong>{pendingCount}</strong> unsaved change{pendingCount === 1 ? '' : 's'} — writes{' '}
                <strong>{form.targetFileName}</strong>
                {form.targetExists ? ' (updates the existing edited copy; a backup is kept)' : ''}.
              </>
            ) : (
              <>No unsaved changes.</>
            )}
          </span>
          <button type="button" className="pf-btn" disabled={!pendingCount || state === 'writing'} onClick={() => setValues({})}>
            Discard
          </button>
          <button
            type="button"
            className="btn primary"
            disabled={!pendingCount || state === 'writing'}
            onClick={() => void save()}
          >
            {state === 'writing' ? 'WRITING…' : 'SAVE TO COPY'}
          </button>
        </div>
      )}
    </div>
  );
}
