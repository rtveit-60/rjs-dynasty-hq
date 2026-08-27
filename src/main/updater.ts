import { app } from 'electron';
import electronUpdater from 'electron-updater';

const { autoUpdater } = electronUpdater;

let started = false;

/**
 * One launch-time check against GitHub Releases — the app's only network call,
 * gated by the user's auto-update setting. Downloads happen in the background;
 * nothing installs until the user clicks the restart banner.
 */
export function checkForUpdates(enabled: boolean, onReady: (version: string) => void): void {
  if (!app.isPackaged || !enabled || started) return;
  started = true;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on('update-downloaded', (info) => onReady(info.version));
  autoUpdater.checkForUpdates().catch(() => {
    // Offline or GitHub unreachable — silently stay on the current version.
  });
}

export function installUpdate(): void {
  autoUpdater.quitAndInstall();
}
