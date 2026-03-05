import { open, mkdir, unlink } from 'node:fs/promises';
import { join } from 'node:path';

const LOCK_FILENAME = '.indexing.lock';
export const LOCK_WAIT_MS = 1000;
export const LOCK_MAX_RETRIES = 10;

/**
 * Try to acquire an exclusive lock file in the given directory.
 * Returns an async release function on success, null if already locked.
 */
export async function acquireLock(indexDir: string): Promise<(() => Promise<void>) | null> {
  await mkdir(indexDir, { recursive: true });
  const lockPath = join(indexDir, LOCK_FILENAME);
  try {
    const fh = await open(lockPath, 'wx');
    await fh.close();
    return async () => {
      try { await unlink(lockPath); } catch { /* ignore */ }
    };
  } catch {
    return null;
  }
}

/**
 * Force-remove a stale lock file.
 * Returns true if a lock was removed, false if none existed.
 */
export async function releaseLockFile(indexDir: string): Promise<boolean> {
  const lockPath = join(indexDir, LOCK_FILENAME);
  try {
    await unlink(lockPath);
    return true;
  } catch {
    return false;
  }
}
