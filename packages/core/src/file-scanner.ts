import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { type Dirent } from 'node:fs';
import { join, relative, extname } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import ignore, { type Ignore } from 'ignore';
import {
  SUPPORTED_EXTENSIONS,
  SUPPORTED_FILENAMES,
  DIRS_TO_IGNORE,
  FILES_TO_IGNORE,
} from './constants.js';

const execFileAsync = promisify(execFile);
const FILE_HASHES_BASENAME = 'file_hashes';

/**
 * Load .gitignore and codebase-indexer.ignore patterns for a workspace.
 */
export async function loadIgnorePatterns(workspacePath: string, indexDir: string): Promise<Ignore> {
  const ig = ignore();
  const gitignorePath = join(workspacePath, '.gitignore');
  try {
    const content = await readFile(gitignorePath, 'utf-8');
    ig.add(content);
    ig.add('.gitignore');
  } catch {
    // file not found or read error
  }
  const codeIndexIgnorePath = join(workspacePath, indexDir, 'codebase-indexer.ignore');
  try {
    ig.add(await readFile(codeIndexIgnorePath, 'utf-8'));
  } catch {
    // ignore
  }
  return ig;
}

/**
 * Add patterns from a nested .gitignore (subdirectory) to the ignore instance,
 * prefixed with the relative directory path.
 */
export async function addNestedGitignore(dir: string, workspaceRoot: string, ignoreInstance: Ignore): Promise<void> {
  if (dir === workspaceRoot) return;
  const gitignorePath = join(dir, '.gitignore');
  try {
    const content = await readFile(gitignorePath, 'utf-8');
    const relDir = relative(workspaceRoot, dir).replace(/\\/g, '/');
    for (const raw of content.split('\n')) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;
      if (line.startsWith('!')) {
        const pattern = line.slice(1);
        ignoreInstance.add(`!${relDir}/${pattern.startsWith('/') ? pattern.slice(1) : pattern}`);
      } else if (line.startsWith('/')) {
        ignoreInstance.add(`${relDir}${line}`);
      } else {
        ignoreInstance.add(`${relDir}/${line}`);
      }
    }
  } catch {
    // file not found or read error
  }
}

/**
 * Recursively list files in a directory, respecting ignore patterns and extension filters.
 */
export async function listFilesRecursive(dir: string, workspaceRoot: string, ignoreInstance: Ignore): Promise<string[]> {
  const results: string[] = [];
  let entries: Dirent[];
  try {
    entries = await readdir(dir, { withFileTypes: true }) as Dirent[];
  } catch {
    return results;
  }

  await addNestedGitignore(dir, workspaceRoot, ignoreInstance);

  for (const entry of entries) {
    const name = entry.name as unknown as string;
    const fullPath = join(dir, name);
    const relPath = relative(workspaceRoot, fullPath).replace(/\\/g, '/');

    if (entry.isDirectory()) {
      if (DIRS_TO_IGNORE.has(name)) continue;
      if (ignoreInstance.ignores(relPath + '/')) continue;
      results.push(...await listFilesRecursive(fullPath, workspaceRoot, ignoreInstance));
    } else if (entry.isFile()) {
      if (FILES_TO_IGNORE.has(name)) continue;
      const ext = extname(name).toLowerCase();
      if (!SUPPORTED_EXTENSIONS.has(ext) && !SUPPORTED_FILENAMES.has(name)) continue;
      if (ignoreInstance.ignores(relPath)) continue;
      results.push(relPath);
    }
  }
  return results;
}

/**
 * Determine the file hashes filename based on the current git branch.
 */
export async function fileHashesFilename(workspacePath: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
      cwd: workspacePath,
      encoding: 'utf-8',
      timeout: 3000,
    });
    const branch = stdout.trim();
    if (branch && branch !== 'HEAD') {
      const safeBranch = branch.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 64);
      return `${FILE_HASHES_BASENAME}.${safeBranch}.json`;
    }
  } catch { /* no git or detached HEAD */ }
  return `${FILE_HASHES_BASENAME}.json`;
}

async function readHashesFile(fullPath: string): Promise<Record<string, string> | null> {
  try {
    const raw = await readFile(fullPath, 'utf-8');
    const data = JSON.parse(raw) as Record<string, string>;
    return typeof data === 'object' && data !== null ? data : null;
  } catch {
    return null;
  }
}

/**
 * Load file hashes from the index directory, with fallback to main/master branch hashes.
 */
export async function loadFileHashes(indexPath: string, workspacePath: string): Promise<Record<string, string>> {
  const filename = await fileHashesFilename(workspacePath);
  const branchPath = join(indexPath, filename);
  const fromBranch = await readHashesFile(branchPath);
  if (fromBranch) return fromBranch;

  const fallbackBranches = ['main', 'master'];
  for (const branch of fallbackBranches) {
    const fallbackPath = join(indexPath, `${FILE_HASHES_BASENAME}.${branch}.json`);
    const fromFallback = await readHashesFile(fallbackPath);
    if (fromFallback) return fromFallback;
  }

  return {};
}

/**
 * Save file hashes to the index directory.
 */
export async function saveFileHashes(indexPath: string, workspacePath: string, hashes: Record<string, string>): Promise<void> {
  await mkdir(indexPath, { recursive: true });
  const filename = await fileHashesFilename(workspacePath);
  await writeFile(join(indexPath, filename), JSON.stringify(hashes, null, 0), 'utf-8');
}
