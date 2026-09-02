import { useEffect, useRef } from 'react';
import type { MediaEvent } from '../../../shared/types.ts';
import { useDialog } from '../lib/dialog.ts';
import { Masthead, weekLabel } from './Story.tsx';

/** Full-article reader: the quick write-up behind every wire headline. */
export default function ArticleModal({ e, onClose }: { e: MediaEvent; onClose: () => void }) {
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') {
        ev.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  const panelRef = useRef<HTMLDivElement>(null);
  useDialog(panelRef);

  return (
    <div className="art-overlay" onClick={onClose}>
      <div
        className="art-modal"
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={e.headline}
        tabIndex={-1}
        onClick={(ev) => ev.stopPropagation()}
      >
        <div className="art-top">
          <Masthead outlet={e.outlet} />
          <button className="art-close" onClick={onClose} aria-label="Close article">
            ✕
          </button>
        </div>
        <h1 className="art-headline">{e.headline}</h1>
        {e.dek && <p className="art-dek">{e.dek}</p>}
        <div className="art-byline">
          {e.byline ? (
            <>
              <span className="art-author">By {e.byline.name}</span>
              <span className="art-role">{e.byline.role}</span>
            </>
          ) : (
            <span className="art-author">Staff report</span>
          )}
          <span className="art-when">{weekLabel(e)}</span>
        </div>
        <div className="art-rule" />
        <div className="art-body">
          {e.body.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </div>
        {e.tags.filter(Boolean).length > 0 && (
          <div className="art-tags">
            {e.tags
              .filter(Boolean)
              .slice(0, 4)
              .map((t) => (
                <span key={t} className="tag">
                  {t}
                </span>
              ))}
          </div>
        )}
      </div>
    </div>
  );
}
