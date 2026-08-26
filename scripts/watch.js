import fs from 'node:fs';
import fsPromises from 'node:fs/promises';

export function watchFile(absPath, onReload) {
  let debounceTimer = null;

  async function checkStability(retries = 3) {
    try {
      const stat1 = await fsPromises.stat(absPath);
      await new Promise(r => setTimeout(r, 60));
      const stat2 = await fsPromises.stat(absPath);
      if (stat1.size === stat2.size && stat1.mtimeMs === stat2.mtimeMs) {
        onReload();
        return;
      }
      if (retries > 0) {
        await new Promise(r => setTimeout(r, 60));
        await checkStability(retries - 1);
      }
    } catch {
      // file may be temporarily unavailable during write
    }
  }

  const watcher = fs.watch(absPath, () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => checkStability(), 150);
  });

  return () => {
    clearTimeout(debounceTimer);
    watcher.close();
  };
}
