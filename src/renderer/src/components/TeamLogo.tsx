import { useEffect, useState, type ReactNode } from 'react';

export default function TeamLogo({
  row,
  size,
  fallback
}: {
  row: number;
  size: number;
  fallback: ReactNode;
}) {
  const [failed, setFailed] = useState(false);

  useEffect(() => setFailed(false), [row]);

  if (failed) return <>{fallback}</>;
  return (
    <img
      className="team-logo"
      style={{ width: size, height: size }}
      src={`logo://${row}/`}
      alt=""
      draggable={false}
      onError={() => setFailed(true)}
    />
  );
}
