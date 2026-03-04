/**
 * Code indexer orchestrator: scan, filter, chunk, embed, store, search.
 * Class-based refactoring of the original code-index-service.
 */

import { readdirSync, readFileSync, statSync, writeFileSync, existsSync, mkdirSync, openSync, closeSync, unlinkSync, type Dirent } from 'node:fs';
import { join, relative, extname } from 'node:path';
import { createHash } from 'node:crypto';
import { execSync } from 'node:child_process';
import ignore, { type Ignore } from 'ignore';

import type { CodeIndexConfig } from './config.js';
import { resolveEmbeddingConfig } from './config.js';
import { EmbeddingService } from './embedding-service.js';
import { LanceDBStore } from './lancedb-store.js';
import { createFileHash, chunkFileWithAst } from './chunking-service.js';
import type {
  CodeBlock,
  SearchResult,
  IndexState,
  IndexStatus,
  IndexStats,
  DebugChunkEntry,
  SearchOptions,
  IndexOptions,
  ProgressCallback,
} from './types.js';
import {
  DEFAULT_INDEX_DIR,
  SUPPORTED_EXTENSIONS,
  SUPPORTED_FILENAMES,
  DIRS_TO_IGNORE,
  FILES_TO_IGNORE,
  MAX_FILE_SIZE_BYTES,
  EMBEDDING_BATCH_SIZE,
  DEFAULT_SEARCH_LIMIT,
  DEFAULT_MIN_SCORE,
} from './constants.js';

const FILE_HASHES_BASENAME = 'file_hashes';
const LOCK_FILENAME = '.indexing.lock';
const LOCK_WAIT_MS = 1000;
const LOCK_MAX_RETRIES = 10;

export class CodeIndexer {
  private readonly config: CodeIndexConfig;
  private readonly embeddingService: EmbeddingService;
  private readonly statusByWorkspace = new Map<
    string,
    { status: IndexStatus; message: string; files_processed: number; files_total: number }
  >();
  private progressCallbacks: ProgressCallback[] = [];

  constructor(config: CodeIndexConfig) {
    this.config = config;
    this.embeddingService = new EmbeddingService(resolveEmbeddingConfig(config.embedding));
  }

  /**
   * Register a progress callback for indexing status updates.
   */
  onProgress(callback: ProgressCallback): void {
    this.progressCallbacks.push(callback);
  }

  /**
   * Remove a previously registered progress callback.
   */
  offProgress(callback: ProgressCallback): void {
    this.progressCallbacks = this.progressCallbacks.filter((cb) => cb !== callback);
  }

  /**
   * Whether code indexing is enabled.
   */
  isEnabled(): boolean {
    if (this.config.enabled === false) return false;
    return this.embeddingService.isConfigured();
  }

  /**
   * Get in-memory index status for a workspace.
   */
  getIndexStatus(workspacePath: string): IndexState {
    const cached = this.statusByWorkspace.get(workspacePath);
    if (cached) {
      return {
        status: cached.status,
        message: cached.message,
        files_processed: cached.files_processed,
        files_total: cached.files_total,
      };
    }
    return { status: 'standby', message: '', files_processed: 0, files_total: 0 };
  }

  /**
   * Returns indexed file count from store when index exists and is complete.
   */
  async getIndexStats(workspacePath: string): Promise<IndexStats | null> {
    if (!this.isEnabled()) return null;
    const indexPath = this.resolveIndexPath(workspacePath);
    const vectorSize = this.embeddingService.getDimensions();
    const store = new LanceDBStore({ dbPath: indexPath, vectorSize });
    try {
      await store.initialize();
      const complete = await store.isIndexComplete();
      const hasData = await store.hasData();
      const fileCount = store.getIndexedFileCount();
      await store.close();
      if (!complete || !hasData) return null;
      return { fileCount };
    } catch {
      await store.close().catch(() => {});
      return null;
    }
  }

  /**
   * Full index of a workspace.
   * Uses shared cache when the workspace has a git remote URL.
   */
  async indexWorkspace(workspacePath: string, options?: IndexOptions): Promise<IndexState> {
    const force = options?.force ?? false;

    if (!this.isEnabled()) {
      this.setStatus(workspacePath, 'standby', 'Code index is disabled', 0, 0);
      return this.getIndexStatus(workspacePath);
    }

    const indexPath = this.resolveIndexPath(workspacePath);
    const vectorSize = this.embeddingService.getDimensions();

    // Acquire exclusive lock; retry up to LOCK_MAX_RETRIES times
    let releaseLock: (() => void) | null = null;
    for (let attempt = 0; attempt < LOCK_MAX_RETRIES; attempt++) {
      releaseLock = this.acquireLock(indexPath);
      if (releaseLock) break;
      // Another process is indexing; if already complete, skip
      const checkStore = new LanceDBStore({ dbPath: indexPath, vectorSize });
      try {
        await checkStore.initialize();
        const complete = await checkStore.isIndexComplete();
        const fileCount = checkStore.getIndexedFileCount();
        await checkStore.close();
        if (complete && !force) {
          this.setStatus(workspacePath, 'indexed', 'Index complete (shared cache hit)', fileCount, fileCount);
          return this.getIndexStatus(workspacePath);
        }
      } catch {
        await checkStore.close().catch(() => {});
      }
      await sleep(LOCK_WAIT_MS);
    }

    if (!releaseLock) {
      this.setStatus(workspacePath, 'error', 'Could not acquire index lock after retries', 0, 0);
      return this.getIndexStatus(workspacePath);
    }

    const store = new LanceDBStore({ dbPath: indexPath, vectorSize });

    try {
      this.setStatus(workspacePath, 'indexing', 'Listing files...', 0, 0);
      const ignoreInstance = this.loadIgnorePatterns(workspacePath);
      const filePaths = this.listFilesRecursive(workspacePath, workspacePath, ignoreInstance);
      const total = filePaths.length;
      this.setStatus(workspacePath, 'indexing', 'Initializing store...', 0, total);

      await store.initialize();
      if (!force) {
        await store.markIndexingIncomplete();
      }

      const prevHashes = force ? {} : this.loadFileHashes(indexPath, workspacePath);
      const currentHashes: Record<string, string> = {};
      const toIndex: string[] = [];
      const toDelete: string[] = [];
      const contentCache = new Map<string, string>();

      for (const relPath of filePaths) {
        const absPath = join(workspacePath, relPath);
        let stat;
        try {
          stat = statSync(absPath);
        } catch {
          continue;
        }
        if (!stat.isFile() || stat.size > MAX_FILE_SIZE_BYTES) continue;
        const content = readFileSync(absPath, 'utf-8');
        const hash = createFileHash(content);
        currentHashes[relPath] = hash;
        if (prevHashes[relPath] !== hash) {
          toIndex.push(relPath);
          contentCache.set(relPath, content);
        }
      }
      for (const relPath of Object.keys(prevHashes)) {
        if (!currentHashes[relPath]) toDelete.push(relPath);
      }

      if (toDelete.length > 0) {
        await store.deleteByFilePaths(toDelete);
      }

      let processed = 0;
      const batchSize = EMBEDDING_BATCH_SIZE;
      for (let i = 0; i < toIndex.length; i += batchSize) {
        const batchPaths = toIndex.slice(i, i + batchSize);
        const allBlocks: CodeBlock[] = [];
        for (const relPath of batchPaths) {
          const cached = contentCache.get(relPath);
          const content = cached ?? readFileSync(join(workspacePath, relPath), 'utf-8');
          if (cached) contentCache.delete(relPath);
          const fileHash = currentHashes[relPath]!;
          const blocks = await chunkFileWithAst(relPath, content, fileHash);
          allBlocks.push(...blocks);
        }
        // Embed first, then delete old chunks, then insert new ones.
        // This order prevents data loss if embedding fails mid-batch.
        if (allBlocks.length > 0) {
          const texts = allBlocks.map((b) => b.content);
          const vectors = await this.embeddingService.embedBatch(texts);
          await store.deleteByFilePaths(batchPaths);
          await store.upsert(allBlocks, vectors);
        } else {
          await store.deleteByFilePaths(batchPaths);
        }
        processed += batchPaths.length;
        this.setStatus(workspacePath, 'indexing', `Indexed ${processed}/${toIndex.length} files`, processed, total);
      }

      this.saveFileHashes(indexPath, workspacePath, currentHashes);
      await store.markIndexingComplete(total);
      await store.optimize();
      await store.createFtsIndex();
      await store.close();
      releaseLock();
      this.setStatus(workspacePath, 'indexed', 'Index complete', total, total);
      return this.getIndexStatus(workspacePath);
    } catch (err) {
      releaseLock();
      const message = err instanceof Error ? err.message : String(err);
      this.setStatus(workspacePath, 'error', message, 0, 0);
      await store.close().catch(() => {});
      return this.getIndexStatus(workspacePath);
    }
  }

  /**
   * Search in workspace code index.
   * Supports three modes: 'vector' (semantic), 'fts' (keyword), 'hybrid' (both + RRF).
   * Default mode is 'hybrid'.
   */
  async searchWorkspace(
    workspacePath: string,
    query: string,
    options?: SearchOptions,
  ): Promise<SearchResult[]> {
    if (!this.isEnabled()) return [];

    const indexPath = this.resolveIndexPath(workspacePath);
    const vectorSize = this.embeddingService.getDimensions();
    const store = new LanceDBStore({ dbPath: indexPath, vectorSize });
    const mode = options?.mode ?? 'hybrid';

    try {
      await store.initialize();
      const data = await store.hasData();
      if (!data) {
        await store.close();
        return [];
      }

      const searchOpts = {
        pathPrefix: options?.pathPrefix,
        limit: options?.limit ?? DEFAULT_SEARCH_LIMIT,
        minScore: options?.minScore ?? DEFAULT_MIN_SCORE,
      };

      let results: SearchResult[];

      if (mode === 'fts') {
        results = await store.ftsSearch(query, searchOpts);
      } else if (mode === 'vector') {
        const [queryVector] = await this.embeddingService.embedBatch([query]);
        results = await store.search(queryVector!, searchOpts);
      } else {
        // hybrid: vector + FTS + RRF
        const [queryVector] = await this.embeddingService.embedBatch([query]);
        results = await store.hybridSearch(queryVector!, query, searchOpts);
      }

      await store.close();
      return results;
    } catch (err) {
      console.warn('[CodeIndexer] search failed:', (err as Error).message);
      await store.close().catch(() => {});
      return [];
    }
  }

  /**
   * Whether the workspace has an existing index (with data and marked complete).
   */
  async hasIndex(workspacePath: string): Promise<boolean> {
    if (!this.isEnabled()) return false;
    const indexPath = this.resolveIndexPath(workspacePath);
    const vectorSize = this.embeddingService.getDimensions();
    const store = new LanceDBStore({ dbPath: indexPath, vectorSize });
    try {
      await store.initialize();
      const complete = await store.isIndexComplete();
      const hasData = await store.hasData();
      await store.close();
      return complete && hasData;
    } catch {
      return false;
    }
  }

  /**
   * List all distinct indexed file paths for a workspace.
   */
  async listIndexedFiles(workspacePath: string): Promise<string[]> {
    if (!this.isEnabled()) return [];
    const indexPath = this.resolveIndexPath(workspacePath);
    const vectorSize = this.embeddingService.getDimensions();
    const store = new LanceDBStore({ dbPath: indexPath, vectorSize });

    try {
      await store.initialize();
      const hasData = await store.hasData();
      if (!hasData) {
        await store.close();
        return [];
      }
      const files = await store.listDistinctFilePaths();
      await store.close();
      return files;
    } catch (err) {
      console.warn('[CodeIndexer] listIndexedFiles failed:', (err as Error).message ?? String(err));
      await store.close().catch(() => {});
      return [];
    }
  }

  /**
   * List stored code index chunks for a given file path or path prefix.
   */
  async listChunksInIndex(
    workspacePath: string,
    pathFilter: string,
    limit: number,
  ): Promise<DebugChunkEntry[]> {
    if (!this.isEnabled()) return [];
    const indexPath = this.resolveIndexPath(workspacePath);
    const vectorSize = this.embeddingService.getDimensions();
    const store = new LanceDBStore({ dbPath: indexPath, vectorSize });

    try {
      await store.initialize();
      const hasData = await store.hasData();
      if (!hasData) {
        await store.close();
        return [];
      }
      const rows = await store.listChunksByPath(pathFilter, limit);
      await store.close();
      return rows.map((row) => {
        const content = row.codeChunk ?? '';
        return {
          file_path: row.filePath,
          start_line: row.startLine,
          end_line: row.endLine,
          content,
          segment_hash: row.id,
          char_count: content.length,
          symbol: row.symbol || undefined,
          parentScope: row.parentScope || undefined,
          kind: (row.kind || undefined) as DebugChunkEntry['kind'],
        };
      });
    } catch (err) {
      console.warn('[CodeIndexer] listChunksInIndex failed:', (err as Error).message ?? String(err));
      await store.close().catch(() => {});
      return [];
    }
  }

  /**
   * Re-chunk a single file using the active chunking logic (AST + fallback),
   * without writing embeddings or modifying the index.
   */
  async rechunkFileForDebug(
    workspacePath: string,
    relativePath: string,
    limit = 50,
  ): Promise<DebugChunkEntry[]> {
    const absPath = join(workspacePath, relativePath);
    try {
      const stat = statSync(absPath);
      if (!stat.isFile() || stat.size > MAX_FILE_SIZE_BYTES) {
        return [];
      }
      const content = readFileSync(absPath, 'utf-8');
      const fileHash = createFileHash(content);
      const blocks = await chunkFileWithAst(relativePath, content, fileHash);
      const limited = blocks.slice(0, limit);
      return limited.map((block) => ({
        file_path: block.file_path,
        start_line: block.start_line,
        end_line: block.end_line,
        content: block.content,
        segment_hash: block.segment_hash,
        char_count: block.content.length,
        symbol: block.symbol,
        parentScope: block.parentScope,
        kind: block.kind,
      }));
    } catch (err) {
      console.warn('[CodeIndexer] rechunkFileForDebug failed:', (err as Error).message ?? String(err));
      return [];
    }
  }

  // --- Private helpers ---

  private setStatus(
    workspacePath: string,
    status: IndexStatus,
    message: string,
    files_processed: number,
    files_total: number,
  ): void {
    this.statusByWorkspace.set(workspacePath, { status, message, files_processed, files_total });
    const state: IndexState = { status, message, files_processed, files_total };
    for (const cb of this.progressCallbacks) {
      try {
        cb(state);
      } catch {
        // ignore callback errors
      }
    }
  }

  private getIndexDir(): string {
    return this.config.indexDir ?? DEFAULT_INDEX_DIR;
  }

  private getSharedIndexBaseDir(): string | undefined {
    return this.config.sharedIndexBaseDir;
  }

  /**
   * Resolves the LanceDB directory for a workspace.
   * If shared cache is configured and workspace has a git remote, uses shared cache.
   * Otherwise falls back to workspace-local path.
   */
  private resolveIndexPath(workspacePath: string): string {
    const sharedBase = this.getSharedIndexBaseDir();
    if (sharedBase) {
      try {
        const remoteUrl = execSync('git remote get-url origin', {
          cwd: workspacePath,
          encoding: 'utf-8',
          timeout: 3000,
        }).trim();
        if (remoteUrl) {
          const hash = createHash('sha256').update(remoteUrl).digest('hex').slice(0, 16);
          return join(sharedBase, hash);
        }
      } catch {
        // No remote or git not available → fall through to local path
      }
    }
    return join(workspacePath, this.getIndexDir());
  }

  /**
   * Force-releases a stale index lock for a workspace.
   * Returns true if a lock was removed, false if none existed.
   */
  releaseLock(workspacePath: string): boolean {
    const indexPath = this.resolveIndexPath(workspacePath);
    const lockPath = join(indexPath, LOCK_FILENAME);
    if (existsSync(lockPath)) {
      try {
        unlinkSync(lockPath);
        this.setStatus(workspacePath, 'standby', '', 0, 0);
        return true;
      } catch {
        return false;
      }
    }
    return false;
  }

  private acquireLock(indexDir: string): (() => void) | null {
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

  private fileHashesFilename(workspacePath: string): string {
    try {
      const branch = execSync('git rev-parse --abbrev-ref HEAD', {
        cwd: workspacePath,
        encoding: 'utf-8',
        timeout: 3000,
      }).trim();
      if (branch && branch !== 'HEAD') {
        const safeBranch = branch.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 64);
        return `${FILE_HASHES_BASENAME}.${safeBranch}.json`;
      }
    } catch { /* no git or detached HEAD */ }
    return `${FILE_HASHES_BASENAME}.json`;
  }

  private readHashesFile(fullPath: string): Record<string, string> | null {
    if (!existsSync(fullPath)) return null;
    try {
      const raw = readFileSync(fullPath, 'utf-8');
      const data = JSON.parse(raw) as Record<string, string>;
      return typeof data === 'object' && data !== null ? data : null;
    } catch {
      return null;
    }
  }

  private loadFileHashes(indexPath: string, workspacePath: string): Record<string, string> {
    const filename = this.fileHashesFilename(workspacePath);
    const branchPath = join(indexPath, filename);
    const fromBranch = this.readHashesFile(branchPath);
    if (fromBranch) return fromBranch;

    const fallbackBranches = ['main', 'master'];
    for (const branch of fallbackBranches) {
      const fallbackPath = join(indexPath, `${FILE_HASHES_BASENAME}.${branch}.json`);
      const fromFallback = this.readHashesFile(fallbackPath);
      if (fromFallback) return fromFallback;
    }

    return {};
  }

  private saveFileHashes(indexPath: string, workspacePath: string, hashes: Record<string, string>): void {
    if (!existsSync(indexPath)) mkdirSync(indexPath, { recursive: true });
    writeFileSync(join(indexPath, this.fileHashesFilename(workspacePath)), JSON.stringify(hashes, null, 0), 'utf-8');
  }

  private loadIgnorePatterns(workspacePath: string): Ignore {
    const ig = ignore();
    const gitignorePath = join(workspacePath, '.gitignore');
    if (existsSync(gitignorePath)) {
      try {
        const content = readFileSync(gitignorePath, 'utf-8');
        ig.add(content);
        ig.add('.gitignore');
      } catch {
        // ignore read errors
      }
    }
    const indexDir = this.getIndexDir();
    const codeIndexIgnorePath = join(workspacePath, indexDir, 'codebase-indexer.ignore');
    if (existsSync(codeIndexIgnorePath)) {
      try {
        ig.add(readFileSync(codeIndexIgnorePath, 'utf-8'));
      } catch {
        // ignore
      }
    }
    return ig;
  }

  private addNestedGitignore(dir: string, workspaceRoot: string, ignoreInstance: Ignore): void {
    if (dir === workspaceRoot) return;
    const gitignorePath = join(dir, '.gitignore');
    if (!existsSync(gitignorePath)) return;
    try {
      const content = readFileSync(gitignorePath, 'utf-8');
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
      // ignore read errors
    }
  }

  private listFilesRecursive(dir: string, workspaceRoot: string, ignoreInstance: Ignore): string[] {
    const results: string[] = [];
    let entries: Dirent[];
    try {
      entries = readdirSync(dir, { withFileTypes: true }) as Dirent[];
    } catch {
      return results;
    }

    this.addNestedGitignore(dir, workspaceRoot, ignoreInstance);

    for (const entry of entries) {
      const name = entry.name as unknown as string;
      const fullPath = join(dir, name);
      const relPath = relative(workspaceRoot, fullPath).replace(/\\/g, '/');

      if (entry.isDirectory()) {
        if (DIRS_TO_IGNORE.has(name)) continue;
        if (ignoreInstance.ignores(relPath + '/')) continue;
        results.push(...this.listFilesRecursive(fullPath, workspaceRoot, ignoreInstance));
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
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
