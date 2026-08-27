import type { ThemeMode } from '../../../shared/types.ts';
import { useHQ } from '../store.ts';

const MODES: { key: ThemeMode; label: string }[] = [
  { key: 'light', label: 'Light' },
  { key: 'system', label: 'Auto' },
  { key: 'dark', label: 'Dark' }
];

export default function ThemeToggle() {
  const theme = useHQ((s) => s.settings?.theme ?? 'system');
  const setTheme = useHQ((s) => s.setTheme);
  return (
    <div className="theme-toggle">
      {MODES.map((m) => (
        <button
          key={m.key}
          className={theme === m.key ? 'active' : ''}
          onClick={() => void setTheme(m.key)}
        >
          {m.label}
        </button>
      ))}
    </div>
  );
}
