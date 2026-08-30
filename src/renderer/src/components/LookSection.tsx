import { useState } from 'react';
import { BODY_TYPES, DEFAULT_MASKS } from '../../../shared/gear.ts';
import type { FaceOption, GearSlotOptions } from '../../../shared/types.ts';
import FacePickerModal from './FacePickerModal.tsx';

/** What the look actually renders with nothing changed: the given items, plus
 *  the game's own default mask when the look is maskless. */
export function effectiveLook(items: Record<string, string>): Record<string, string> {
  const b = { ...items };
  if (!b.FaceMask && b.HeadWear && DEFAULT_MASKS[b.HeadWear]) b.FaceMask = DEFAULT_MASKS[b.HeadWear];
  return b;
}

/** The game's asset identifier, prettified — never an invented name. */
export function gearLabel(asset: string): string {
  return asset
    .replace(/^Gear_?[A-Za-z]*?_/, '')
    .replace(/^(Towel|FaceMarks|Backplate|Flakjacket|ArmSleeve)_/, '')
    .replace(/^shoe_(low|mid|high)_/, '')
    .replace(/^(visor|glove)_?/, '')
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([A-Za-z])(\d)/g, '$1 $2');
}

/** Tiny headshot preview for the chosen face; falls back to a tone chip. */
function FaceThumb({ portraitId, tone }: { portraitId: number; tone?: number }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <span className="fp-thumb-fallback">{tone ? `T${tone}` : '—'}</span>;
  return (
    <img
      className="fp-thumb"
      src={`portrait://${portraitId}`}
      alt=""
      draggable={false}
      onError={() => setFailed(true)}
    />
  );
}

/**
 * The shared appearance grid: face button, skin tone, and the gear selects,
 * pre-selected to `base` (the base look for a new recruit, the player's own
 * look for an edit). Callers diff against the same `base` at submit time so
 * untouched dropdowns write nothing.
 */
export default function LookSection({
  gearSlots,
  helmetMasks,
  skinTones,
  faces,
  base,
  gear,
  setGear,
  skinTone,
  setSkinTone,
  face,
  setFace,
  bodyType,
  setBodyType,
  currentPortraitId
}: {
  gearSlots: GearSlotOptions[];
  helmetMasks: Record<string, string[]>;
  skinTones: number[];
  faces: FaceOption[];
  base: Record<string, string>;
  gear: Record<string, string>;
  setGear: (updater: (prev: Record<string, string>) => Record<string, string>) => void;
  skinTone: number;
  setSkinTone: (n: number) => void;
  face: FaceOption | null;
  setFace: (f: FaceOption | null) => void;
  bodyType: number;
  setBodyType: (n: number) => void;
  /** Edit mode: the player's current headshot, shown until a face is picked. */
  currentPortraitId?: number;
}) {
  const [pickingFace, setPickingFace] = useState(false);

  return (
    <>
      {pickingFace && (
        <FacePickerModal
          faces={faces}
          value={face}
          onPick={(f) => {
            setFace(f);
            // A chosen head carries its native tone — align the visuals tone.
            if (f) setSkinTone(f.tone);
          }}
          onClose={() => setPickingFace(false)}
        />
      )}
      <div className="cr-grid">
        <label className="ta-field">
          <span>Face</span>
          <button
            type="button"
            className="fp-choose"
            onClick={() => setPickingFace(true)}
            title="Pick a head from the catalog; headshots come from your portrait pack"
          >
            {face ? (
              <>
                <FaceThumb portraitId={face.portraitId} tone={face.tone} />
                <span className="fp-choose-label">Tone {face.tone} head</span>
              </>
            ) : currentPortraitId ? (
              <>
                <FaceThumb portraitId={currentPortraitId} />
                <span className="fp-choose-label">Change face…</span>
              </>
            ) : (
              <span className="fp-choose-label">Choose face…</span>
            )}
          </button>
        </label>
        <label className="ta-field">
          <span>Skin tone</span>
          <select value={skinTone} onChange={(e) => setSkinTone(Number(e.target.value))}>
            {!skinTone && <option value={0}>None</option>}
            {[...new Set([...skinTones, ...(skinTone ? [skinTone] : [])])]
              .sort((a, b) => a - b)
              .map((t) => (
                <option key={t} value={t}>
                  Tone {t}
                </option>
              ))}
          </select>
        </label>
        <label className="ta-field">
          <span>Body type</span>
          <select value={bodyType} onChange={(e) => setBodyType(Number(e.target.value))}>
            {BODY_TYPES.map((b) => (
              <option key={b.value} value={b.value}>
                {b.name.replace(/_BodyType$/, '')}
              </option>
            ))}
          </select>
        </label>
        {gearSlots.map((g) => {
          const shown = gear[g.slot] ?? '';
          // The facemask list locks to what real loadouts wear with the
          // shown helmet.
          const options =
            g.slot === 'FaceMask' && gear.HeadWear
              ? (helmetMasks[gear.HeadWear] ?? [])
              : g.options;
          return (
            <label key={g.slot} className="ta-field">
              <span>{g.label}</span>
              <select
                value={shown}
                onChange={(e) =>
                  setGear((prev) => {
                    const next = { ...prev };
                    const v = e.target.value;
                    if (v) next[g.slot] = v;
                    else delete next[g.slot];
                    if (g.slot === 'HeadWear') {
                      // The mask follows the helmet: kept when it fits,
                      // else the helmet's own default, else its first,
                      // else none (some helmets are only worn maskless).
                      const allowed = v ? (helmetMasks[v] ?? []) : [];
                      if (!next.FaceMask || !allowed.includes(next.FaceMask)) {
                        const def = DEFAULT_MASKS[v];
                        const pick = def && allowed.includes(def) ? def : allowed[0];
                        if (pick) next.FaceMask = pick;
                        else delete next.FaceMask;
                      }
                    }
                    if (g.slot === 'FaceMask' && v && !next.HeadWear) {
                      // No helmet shown at all: the mask brings one.
                      const owner = Object.keys(helmetMasks).find((h) =>
                        helmetMasks[h].includes(v)
                      );
                      if (owner) next.HeadWear = owner;
                    }
                    return next;
                  })
                }
              >
                {(!base[g.slot] || !shown) && <option value="">None</option>}
                {shown && !options.includes(shown) && (
                  <option value={shown}>{gearLabel(shown)}</option>
                )}
                {options.map((o) => (
                  <option key={o} value={o}>
                    {gearLabel(o)}
                  </option>
                ))}
              </select>
            </label>
          );
        })}
      </div>
    </>
  );
}
