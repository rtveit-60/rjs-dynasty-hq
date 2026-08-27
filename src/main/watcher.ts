import chokidar, { type FSWatcher } from 'chokidar';

/**
 * Watches a single save file. The game (and OneDrive, when Documents is synced)
 * can emit bursts of events for one save; awaitWriteFinish waits until the file
 * stops changing before firing. Content de-duplication happens in the pipeline.
 */
export function watchSaveFile(filePath: string, onSettledChange: () => void): () => void {
  const watcher: FSWatcher = chokidar.watch(filePath, {
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 1500, pollInterval: 250 }
  });
  watcher.on('change', onSettledChange);
  watcher.on('add', onSettledChange); // save replaced via temp-file rename
  return () => {
    void watcher.close();
  };
}
