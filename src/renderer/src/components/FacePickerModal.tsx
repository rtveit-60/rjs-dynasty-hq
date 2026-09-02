import { useMemo, useRef, useState } from 'react';
import type { FaceOption } from '../../../shared/types.ts';
import { useDialog } from '../lib/dialog.ts';

/** One headshot tile; the image comes from the portrait pack, absent quietly. */
function FaceTile({
  face,
  selected,
  onPick
}: {
  face: FaceOption;
  selected: boolean;
  onPick: () => void;
}) {
  const [failed, setFailed] = useState(false);
  return (
    <button
      type="button"
      className={`fp-tile ${selected ? 'selected' : ''}`}
      title={`Head #${face.portraitId} · tone ${face.tone}`}
      onClick={onPick}
    >
      {failed || face.hasShot === false ? (
        <span className="fp-fallback">
          <b>#{face.portraitId}</b>
          <span>tone {face.tone}</span>
        </span>
      ) : (
        <img
          src={`portrait://${face.portraitId}`}
          alt=""
          loading="lazy"
          draggable={false}
          onError={() => setFailed(true)}
        />
      )}
    </button>
  );
}

/**
 * The face catalog as a headshot grid, filterable by skin tone. Headshots come
 * from the portrait pack the profiles already use; heads without an extracted
 * image show a labeled tile instead.
 */
export default function FacePickerModal({
  faces,
  value,
  onPick,
  onClose
}: {
  faces: FaceOption[];
  value: FaceOption | null;
  onPick: (face: FaceOption | null) => void;
  onClose: () => void;
}) {
  const [tone, setTone] = useState<number | 0>(value?.tone ?? 0);
  const tones = useMemo(() => [...new Set(faces.map((f) => f.tone))].sort((a, b) => a - b), [faces]);
  const shown = tone ? faces.filter((f) => f.tone === tone) : faces;

  const panelRef = useRef<HTMLDivElement>(null);
  useDialog(panelRef, true, onClose);

  return (
    <div className="ed-overlay fp-overlay" onMouseDown={onClose}>
      <div
        className="ed-panel fp-panel"
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Choose face"
        tabIndex={-1}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="ed-head">
          <span className="ed-title">Choose Face</span>
          <span className="ed-who">
            {shown.length} of {faces.length} heads
            {tone ? ` · tone ${tone}` : ''}
          </span>
          <button type="button" className="pf-btn ed-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <div className="filters fp-tones">
          <button className={`filter ${tone === 0 ? 'active' : ''}`} onClick={() => setTone(0)}>
            All tones
          </button>
          {tones.map((t) => (
            <button key={t} className={`filter ${tone === t ? 'active' : ''}`} onClick={() => setTone(t)}>
              Tone {t}
            </button>
          ))}
          {value && (
            <button
              className="filter"
              style={{ marginLeft: 'auto' }}
              onClick={() => {
                onPick(null);
                onClose();
              }}
            >
              Clear face
            </button>
          )}
        </div>
        <div className="fp-grid">
          {shown.map((f) => (
            <FaceTile
              key={f.assetName}
              face={f}
              selected={value?.assetName === f.assetName}
              onPick={() => {
                onPick(f);
                onClose();
              }}
            />
          ))}
        </div>
        <p className="foot-note">
          Headshots come from your portrait pack; heads without an extracted image show their id.
          Every face carries its own skin tone — picking one sets the recruit's head, in-game
          portrait and headshot together.
        </p>
      </div>
    </div>
  );
}
