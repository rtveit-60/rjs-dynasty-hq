import { useEffect, useState } from 'react';
import { relTime } from '../lib/format.ts';
import { useHQ } from '../store.ts';

/**
 * The titlebar's save status. One persistent live region, so a reader hears
 * "Reading save" and "Live, synced just now" as they happen without the pill
 * being re-created between states.
 */
export default function StatusPill() {
  const status = useHQ((s) => s.status);
  const [, tick] = useState(0);

  // Refresh the relative timestamp once a minute.
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  let cls = 'pill';
  let title: string | undefined;
  let body: React.ReactNode;
  if (status.kind === 'idle') {
    body = 'No save selected';
  } else if (status.kind === 'parsing') {
    cls = 'pill parsing';
    body = 'Reading save…';
  } else if (status.kind === 'error') {
    cls = 'pill error';
    title = status.message;
    body = status.message.length > 48 ? status.message.slice(0, 48) + '…' : status.message;
  } else {
    cls = 'pill live';
    body = `Live${status.lastUpdate ? ` · synced ${relTime(status.lastUpdate)}` : ''}`;
  }

  return (
    <span className={cls} role="status" aria-live="polite" title={title}>
      <span className="dot" /> {body}
    </span>
  );
}
