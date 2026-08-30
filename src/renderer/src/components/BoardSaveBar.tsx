import { useState } from 'react';
import { useHQ } from '../store.ts';

/**
 * Staged board membership changes (shared by the recruiting board and the
 * office). Writes every staged add/remove in one pass through the guarded
 * _RJsEdited path.
 */
export default function BoardSaveBar() {
  const pending = useHQ((s) => s.boardPending);
  const clear = useHQ((s) => s.clearBoardPending);
  const [state, setState] = useState<'idle' | 'writing'>('idle');
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const entries = Object.entries(pending);
  const adds = entries.filter(([, a]) => a === 'add').length;
  const removes = entries.length - adds;
  if (!entries.length && !note && !error) return null;

  const save = async (): Promise<void> => {
    setState('writing');
    setError(null);
    try {
      const res = await window.hq.editBoard({
        changes: entries.map(([row, action]) => ({ recruitRow: Number(row), action }))
      });
      if (res.ok) {
        setNote(res.message);
        setTimeout(() => setNote(null), 5000);
        // staged set clears when the refreshed snapshot lands
      } else {
        setError(res.message);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setState('idle');
    }
  };

  return (
    <div className="dc-savebar">
      {error ? (
        <span className="dc-save-error">{error}</span>
      ) : !entries.length ? (
        <span className="dc-save-note">{note}</span>
      ) : (
        <span className="dc-save-note">
          Board changes staged: {adds > 0 && <strong>{adds} to add</strong>}
          {adds > 0 && removes > 0 && ' · '}
          {removes > 0 && <strong>{removes} to remove</strong>} — writes a{' '}
          <strong>_RJsEdited</strong> copy; the original save is never touched.
        </span>
      )}
      {entries.length > 0 && (
        <>
          <button type="button" className="pf-btn" onClick={clear}>
            Reset
          </button>
          <button
            type="button"
            className="btn primary ed-save"
            disabled={state === 'writing'}
            onClick={() => void save()}
          >
            {state === 'writing' ? 'WRITING…' : 'SAVE TO COPY'}
          </button>
        </>
      )}
    </div>
  );
}

/** The small stage/unstage control shown beside a recruit's name. */
export function BoardToggle({ recruitRow, onBoard }: { recruitRow: number; onBoard: boolean }) {
  const pending = useHQ((s) => s.boardPending[recruitRow]);
  const toggle = useHQ((s) => s.toggleBoardPending);
  const action = onBoard ? 'remove' : 'add';
  const staged = pending === action;
  return (
    <button
      type="button"
      className={`bd-btn ${action} ${staged ? 'staged' : ''}`}
      title={
        staged
          ? `Staged to ${action} — click to undo`
          : onBoard
            ? 'Remove from your board (stages the change)'
            : 'Add to your board (stages the change)'
      }
      onClick={(e) => {
        e.stopPropagation();
        toggle(recruitRow, action);
      }}
    >
      {onBoard ? '✕' : '+'}
    </button>
  );
}
