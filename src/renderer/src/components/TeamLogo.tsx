import { useEffect, useState, type ReactNode } from 'react';
import { create } from 'zustand';

/** Bumped after a logo import so previously-404'd images retry. */
export const useLogoVersion = create<{ v: number; bump: () => void }>((set) => ({
  v: 0,
  bump: () => set((s) => ({ v: s.v + 1 }))
}));

export default function TeamLogo({
  row,
  size,
  fallback
}: {
  row: number;
  size: number;
  fallback: ReactNode;
}) {
  const v = useLogoVersion((s) => s.v);
  const [failed, setFailed] = useState(false);

  useEffect(() => setFailed(false), [row, v]);

  if (failed) return <>{fallback}</>;
  return (
    <img
      className="team-logo"
      style={{ width: size, height: size }}
      src={`logo://${row}/?v=${v}`}
      alt=""
      draggable={false}
      onError={() => setFailed(true)}
    />
  );
}
