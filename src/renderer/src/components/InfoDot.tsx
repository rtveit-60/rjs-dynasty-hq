import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useDialog } from '../lib/dialog.ts';

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

  const panelRef = useRef<HTMLDivElement>(null);
  useDialog(panelRef, open);

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
      {open &&
        /* Portaled to <body>: the dot can sit inside clipped chrome (the team
           tab bar clips to its plate shape) without the dialog inheriting the
           clip — fixed-position boxes still clip under an ancestor clip-path. */
        createPortal(
          <div className="info-overlay" onClick={() => setOpen(false)}>
            <div
              className="info-dialog"
              ref={panelRef}
              role="dialog"
              aria-modal="true"
              aria-label={title}
              tabIndex={-1}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="info-head">
                <span className="info-title">{title}</span>
                <button type="button" className="info-close" onClick={() => setOpen(false)} aria-label="Close">
                  ✕
                </button>
              </div>
              <div className="info-body">{children}</div>
            </div>
          </div>,
          document.body
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
