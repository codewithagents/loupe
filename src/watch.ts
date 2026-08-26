import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import path from 'node:path';

export function watchFile(absPath: string, onReload: () => void): () => void {
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let watcher: fs.FSWatcher | null = null;
  let stopped = false;

  const dir = path.dirname(absPath);
  const basename = path.basename(absPath);

  async function checkStability(retries = 3): Promise<void> {
    try {
      const stat1 = await fsPromises.stat(absPath);
      await new Promise<void>(r => setTimeout(r, 60));
      const stat2 = await fsPromises.stat(absPath);
      if (stat1.size === stat2.size && stat1.mtimeMs === stat2.mtimeMs) {
        onReload();
        return;
      }
      if (retries > 0) {
        await new Promise<void>(r => setTimeout(r, 60));
        await checkStability(retries - 1);
      }
    } catch {
      // file may be temporarily unavailable during write
    }
  }

  function scheduleCheck(): void {
    if (debounceTimer !== null) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => checkStability(), 150);
  }

  function startWatcher(): void {
    if (stopped) return;
    try {
      watcher = fs.watch(dir, (_eventType: string, filename: string | null) => {
        if (filename === basename) {
          scheduleCheck();
        }
      });
      watcher.unref();
      watcher.on('error', () => {
        if (!stopped) {
          watcher?.close();
          setTimeout(startWatcher, 200);
        }
      });
    } catch {
      if (!stopped) setTimeout(startWatcher, 200);
    }
  }

  startWatcher();

  return () => {
    stopped = true;
    if (debounceTimer !== null) clearTimeout(debounceTimer);
    if (watcher) watcher.close();
  };
}
