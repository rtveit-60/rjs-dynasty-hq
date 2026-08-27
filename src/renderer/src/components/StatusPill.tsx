import { useEffect, useState } from 'react';
import { relTime } from '../lib/format.ts';
import { useHQ } from '../store.ts';

export default function StatusPill() {
  const status = useHQ((s) => s.status);
  const [, tick] = useState(0);

  // Refresh the relative timestamp once a minute.
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  if (status.kind === 'idle') {
    return (
      <span className="pill">
        <span className="dot" /> No save selected
      </span>
    );
  }
  if (status.kind === 'parsing') {
    return (
      <span className="pill parsing">
        <span className="dot" /> Reading save…
      </span>
    );
  }
  if (status.kind === 'error') {
    return (
      <span className="pill error" title={status.message}>
        <span className="dot" /> {status.message.length > 48 ? status.message.slice(0, 48) + '…' : status.message}
      </span>
    );
  }
  return (
    <span className="pill live">
      <span className="dot" /> Live
      {status.lastUpdate ? ` · synced ${relTime(status.lastUpdate)}` : ''}
    </span>
  );
}
