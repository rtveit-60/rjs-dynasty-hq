import { useEffect, useRef, useState } from 'react';

/**
 * Major (labeled) and minor (hairline) tick spacing for a slider's range.
 * The game's wide sliders (0–100 skill/penalty, 0–300 XP) tick every 50 with
 * a hairline every 10; the short league counters (0–10 / 0–20 / 0–30) scale
 * down so the track still reads.
 */
export function tickSteps(min: number, max: number): { major: number; minor: number } {
  const span = max - min;
  if (span >= 100) return { major: 50, minor: 10 };
  if (span >= 20) return { major: 10, minor: 5 };
  return { major: 5, minor: 1 };
}

/**
 * The sliding scale under a settings stepper: a track with tick marks and a
 * knob the user drags (or clicks the track to jump). Integer values only,
 * clamped to the field's schema range; the stepper above stays the precise
 * control. Keyboard: arrows ±1, Shift/PageUp/PageDown ±(minor tick), Home/End.
 */
export default function SettingScale({
  value,
  min,
  max,
  changed,
  label,
  onChange
}: {
  value: number;
  min: number;
  max: number;
  changed: boolean;
  label: string;
  onChange: (next: number) => void;
}) {
  const track = useRef<HTMLDivElement | null>(null);
  const latest = useRef({ value, onChange });
  latest.current = { value, onChange };
  const [dragging, setDragging] = useState(false);

  const span = Math.max(1, max - min);
  const clamp = (n: number): number => Math.max(min, Math.min(max, Math.round(n)));
  const pct = (n: number): number => ((n - min) / span) * 100;
  const { major, minor } = tickSteps(min, max);

  const valueAt = (clientX: number): number => {
    const el = track.current;
    if (!el) return latest.current.value;
    const r = el.getBoundingClientRect();
    if (r.width <= 0) return latest.current.value;
    const t = Math.max(0, Math.min(1, (clientX - r.left) / r.width));
    return clamp(min + t * span);
  };
  const fire = (next: number): void => {
    if (next !== latest.current.value) latest.current.onChange(next);
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>): void => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(true);
    fire(valueAt(e.clientX));
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>): void => {
    if (!dragging) return;
    fire(valueAt(e.clientX));
  };
  const endDrag = (e: React.PointerEvent<HTMLDivElement>): void => {
    if (!dragging) return;
    setDragging(false);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
  };
  useEffect(() => {
    if (!dragging) return;
    const up = (): void => setDragging(false);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => {
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
  }, [dragging]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>): void => {
    const v = latest.current.value;
    const big = e.shiftKey ? minor : 1;
    let next: number | null = null;
    switch (e.key) {
      case 'ArrowLeft':
      case 'ArrowDown':
        next = v - big;
        break;
      case 'ArrowRight':
      case 'ArrowUp':
        next = v + big;
        break;
      case 'PageDown':
        next = v - minor;
        break;
      case 'PageUp':
        next = v + minor;
        break;
      case 'Home':
        next = min;
        break;
      case 'End':
        next = max;
        break;
      default:
        return;
    }
    e.preventDefault();
    fire(clamp(next));
  };

  const majors: number[] = [];
  for (let t = min; t <= max; t += major) majors.push(t);
  if (majors[majors.length - 1] !== max) majors.push(max);
  const minors: number[] = [];
  for (let t = min; t <= max; t += minor) if ((t - min) % major !== 0) minors.push(t);

  return (
    <div
      className={`ds-scale ${changed ? 'changed' : ''} ${dragging ? 'dragging' : ''}`}
      ref={track}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      <div className="ds-rail">
        <div className="ds-fill" style={{ width: `${pct(value)}%` }} />
        {minors.map((t) => (
          <span key={`m${t}`} className="ds-tick minor" style={{ left: `${pct(t)}%` }} />
        ))}
        {majors.map((t) => (
          <span key={`M${t}`} className="ds-tick major" style={{ left: `${pct(t)}%` }} />
        ))}
        <div
          className="ds-knob-h"
          role="slider"
          tabIndex={0}
          aria-label={label}
          aria-valuemin={min}
          aria-valuemax={max}
          aria-valuenow={value}
          style={{ left: `${pct(value)}%` }}
          onKeyDown={onKeyDown}
        />
      </div>
      <div className="ds-ticklbls" aria-hidden="true">
        {majors.map((t) => (
          <span key={`L${t}`} style={{ left: `${pct(t)}%` }}>
            {t}
          </span>
        ))}
      </div>
    </div>
  );
}
