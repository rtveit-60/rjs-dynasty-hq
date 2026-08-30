import { useEffect, useMemo, useState } from 'react';
import type { Snapshot } from '../../../shared/types.ts';
import { DEPTH_LABELS, DEPTH_SECTIONS, ovrTier, yearAbbrev } from '../lib/format.ts';
import { NameLink } from './ProfileModal.tsx';

type School = NonNullable<Snapshot['school']>;

/** Drag payload: which window and slot a name came from. */
interface DragFrom {
  pos: string;
  index: number;
}

/**
 * The depth chart, editable by drag and drop: dropping one name on another
 * swaps the two slots (within a window or across windows), so every window
 * keeps its game-defined slot count. Changes stage locally and write to the
 * <save>_RJsEdited sibling on SAVE TO COPY, through the same guarded path as
 * every other edit.
 */
export default function DepthChartView({ school, browsing = false }: { school: School; browsing?: boolean }) {
  const byRow = useMemo(() => new Map(school.roster.map((p) => [p.row, p])), [school.roster]);
  const slots = useMemo(() => new Map(school.depthChart.map((s) => [s.position, s])), [school.depthChart]);

  /** Staged orders per window; absent = unchanged. */
  const [pending, setPending] = useState<Record<string, number[]>>({});
  const [dragging, setDragging] = useState<DragFrom | null>(null);
  const [over, setOver] = useState<DragFrom | null>(null);
  const [state, setState] = useState<'idle' | 'writing'>('idle');
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // A fresh parse (including our own write landing) resets the staging area.
  useEffect(() => {
    setPending({});
    setError(null);
  }, [school.depthChart]);

  if (!school.depthChart.length) {
    return <div className="empty">No depth chart found in this save.</div>;
  }

  const rowsOf = (pos: string): number[] => pending[pos] ?? slots.get(pos)?.playerRows ?? [];

  const swap = (a: DragFrom, b: DragFrom): void => {
    if (a.pos === b.pos && a.index === b.index) return;
    const aRows = [...rowsOf(a.pos)];
    if (a.pos === b.pos) {
      [aRows[a.index], aRows[b.index]] = [aRows[b.index], aRows[a.index]];
      setPending((prev) => ({ ...prev, [a.pos]: aRows }));
      return;
    }
    const bRows = [...rowsOf(b.pos)];
    const tmp = aRows[a.index];
    aRows[a.index] = bRows[b.index];
    bRows[b.index] = tmp;
    setPending((prev) => ({ ...prev, [a.pos]: aRows, [b.pos]: bRows }));
  };

  const changes = Object.entries(pending)
    .filter(([pos, rows]) => rows.join(',') !== (slots.get(pos)?.playerRows ?? []).join(','))
    .map(([position, playerRows]) => ({ position, playerRows }));

  const save = async (): Promise<void> => {
    if (!changes.length) return;
    setState('writing');
    setError(null);
    try {
      const res = await window.hq.editDepthChart({ changes });
      if (res.ok) {
        setNote(res.message);
        setTimeout(() => setNote(null), 5000);
        // pending clears when the refreshed snapshot lands (effect above)
      } else {
        setError(res.message);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setState('idle');
    }
  };

  const known = new Set(DEPTH_SECTIONS.flatMap((s) => s.positions));
  const extras = school.depthChart.filter((s) => !known.has(s.position)).map((s) => s.position);
  const sections = extras.length
    ? [...DEPTH_SECTIONS, { title: 'Other', positions: extras }]
    : DEPTH_SECTIONS;

  return (
    <>
      {!browsing && (changes.length > 0 || note || error) && (
        <div className="dc-savebar">
          {error ? (
            <span className="dc-save-error">{error}</span>
          ) : note && !changes.length ? (
            <span className="dc-save-note">{note}</span>
          ) : (
            <span className="dc-save-note">
              {changes.length} window{changes.length === 1 ? '' : 's'} changed — writes a{' '}
              <strong>_RJsEdited</strong> copy; the original save is never touched.
            </span>
          )}
          {changes.length > 0 && (
            <>
              <button type="button" className="pf-btn" onClick={() => setPending({})}>
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
      )}

      {sections.map((section) => {
        const present = section.positions.filter((p) => slots.has(p));
        if (!present.length) return null;
        return (
          <div key={section.title}>
            <div className="section-h">
              <h3>{section.title}</h3>
              <div className="rule" />
            </div>
            <div className="dc-grid">
              {present.map((pos) => {
                const original = slots.get(pos)!.playerRows;
                const rows = rowsOf(pos);
                return (
                  <div key={pos} className="dc-card">
                    <div className="dc-pos">
                      <b>{pos}</b>
                      <span>{DEPTH_LABELS[pos] ?? ''}</span>
                    </div>
                    {rows.map((row, i) => {
                      const p = byRow.get(row);
                      const moved = original[i] !== row;
                      const isOver = over?.pos === pos && over.index === i;
                      const isDragged = dragging?.pos === pos && dragging.index === i;
                      return (
                        <div
                          key={`${row}-${i}`}
                          className={`dc-row ${i === 0 ? 'starter' : ''} ${moved ? 'moved' : ''} ${isOver ? 'dragover' : ''} ${isDragged ? 'dragging' : ''}`}
                          draggable={!browsing}
                          onDragStart={(e) => {
                            if (browsing) return;
                            setDragging({ pos, index: i });
                            e.dataTransfer.effectAllowed = 'move';
                            e.dataTransfer.setData('text/plain', `${pos}:${i}`);
                          }}
                          onDragEnd={() => {
                            setDragging(null);
                            setOver(null);
                          }}
                          onDragOver={(e) => {
                            e.preventDefault();
                            e.dataTransfer.dropEffect = 'move';
                            if (!isOver) setOver({ pos, index: i });
                          }}
                          onDragLeave={() => isOver && setOver(null)}
                          onDrop={(e) => {
                            e.preventDefault();
                            const [fromPos, fromIdx] = e.dataTransfer.getData('text/plain').split(':');
                            if (!browsing && fromPos && fromIdx !== undefined) {
                              swap({ pos: fromPos, index: Number(fromIdx) }, { pos, index: i });
                            }
                            setDragging(null);
                            setOver(null);
                          }}
                        >
                          <span className="dc-depth">{i + 1}</span>
                          <span className="nm">
                            {p ? (
                              <>
                                <NameLink req={{ kind: 'player', row }}>
                                  {p.firstName} {p.lastName}
                                </NameLink>{' '}
                                <span className="dc-year">{yearAbbrev(p.schoolYear, p.redshirt)}</span>
                              </>
                            ) : (
                              <span className="dc-year">(off roster)</span>
                            )}
                          </span>
                          {p && <span className={ovrTier(p.overall)}>{p.overall}</span>}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
      {browsing ? (
        <p className="foot-note">Another program's chart — view only.</p>
      ) : (
      <p className="foot-note">
        Drag one name onto another to swap their spots — within a window or across windows. Windows
        keep the game's own slot counts; changes stage here and write to a separate _RJsEdited copy
        of your save.
      </p>
      )}
    </>
  );
}
