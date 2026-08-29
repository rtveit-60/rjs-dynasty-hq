import { useHQ } from '../store.ts';

export const SCALE_MIN = 0.7;
export const SCALE_MAX = 1.5;
export const SCALE_STEP = 0.1;

export function clampScale(v: number): number {
  const snapped = Math.round(v * 10) / 10;
  return Math.min(SCALE_MAX, Math.max(SCALE_MIN, snapped));
}

/**
 * Stepper for the app-wide zoom. FIT tracks window width, so the interface
 * fills a maximized monitor and shrinks into a tucked-away corner; A− / A+
 * bias the result either way. Lives in the rail foot and in Setup.
 */
export default function ScaleControl() {
  const scale = useHQ((s) => s.settings?.uiScale ?? 1);
  const fit = useHQ((s) => s.settings?.uiFit ?? true);
  const effective = useHQ((s) => s.effectiveZoom);
  const setUiScale = useHQ((s) => s.setUiScale);
  const setUiFit = useHQ((s) => s.setUiFit);
  const bump = (d: number) => void setUiScale(clampScale(scale + d));
  return (
    <div className="theme-toggle scale-ctl">
      <button
        className={fit ? 'active' : ''}
        onClick={() => void setUiFit(!fit)}
        title="Scale with the window"
      >
        FIT
      </button>
      <button onClick={() => bump(-SCALE_STEP)} disabled={scale <= SCALE_MIN} title="Smaller (Ctrl+−)">
        A−
      </button>
      <button className="pct" onClick={() => void setUiScale(1)} title="Reset (Ctrl+0)">
        {Math.round((fit ? effective : scale) * 100)}%
      </button>
      <button onClick={() => bump(SCALE_STEP)} disabled={scale >= SCALE_MAX} title="Larger (Ctrl+=)">
        A+
      </button>
    </div>
  );
}
