import { useEffect, useState } from 'react';

/**
 * A small circled "i" that opens a dialog explaining the block it sits in.
 * Keeps instructional copy out of the layout: the page stays clean, the
 * explanation is one click away.
 */
export default function InfoDot({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);

  // Capture-phase Esc so an open dialog closes without also popping whatever
  // sits underneath it (profile stack, pickers).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      setOpen(false);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open]);

  return (
    <>
      <button
        type="button"
        className="info-dot"
        aria-label={`About ${title}`}
        title={title}
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
      >
        i
      </button>
      {open && (
        <div className="info-overlay" onClick={() => setOpen(false)}>
          <div className="info-dialog" role="dialog" aria-label={title} onClick={(e) => e.stopPropagation()}>
            <div className="info-head">
              <span className="info-title">{title}</span>
              <button type="button" className="info-close" onClick={() => setOpen(false)} aria-label="Close">
                ✕
              </button>
            </div>
            <div className="info-body">{children}</div>
          </div>
        </div>
      )}
    </>
  );
}

/** A term-and-definition row inside an info dialog. */
export function InfoRow({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div className="info-row">
      <span className="info-term">{term}</span>
      <span>{children}</span>
    </div>
  );
}
