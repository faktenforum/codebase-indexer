import { existsSync, mkdirSync, openSync, closeSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

const LOCK_FILENAME = '.indexing.lock';
export const LOCK_WAIT_MS = 1000;
export const LOCK_MAX_RETRIES = 10;

/**
 * Try to acquire an exclusive lock file in the given directory.
 * Returns a release function on success, null if already locked.
 */
export function acquireLock(indexDir: string): (() => void) | null {
  if (!existsSync(indexDir)) mkdirSync(indexDir, { recursive: true });
  const lockPath = join(indexDir, LOCK_FILENAME);
  try {
    const fd = openSync(lockPath, 'wx');
    closeSync(fd);
    return () => {
      try { unlinkSync(lockPath); } catch { /* ignore */ }
    };
  } catch {
    return null;
  }
}

/**
 * Force-remove a stale lock file.
 * Returns true if a lock was removed, false if none existed.
 */
export function releaseLockFile(indexDir: string): boolean {
  const lockPath = join(indexDir, LOCK_FILENAME);
  if (existsSync(lockPath)) {
    try {
      unlinkSync(lockPath);
      return true;
    } catch {
      return false;
    }
  }
  return false;
}
