/**
 * Code indexer orchestrator: scan, filter, chunk, embed, store, search.
 */

import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import type { CodeIndexConfig } from './config.js';
import { resolveEmbeddingConfig } from './config.js';
import { EmbeddingService } from './embedding-service.js';
import { LanceDBStore } from './lancedb-store.js';
import { createFileHash, chunkFileWithAst } from './chunking/index.js';
import { acquireLock, releaseLockFile, LOCK_WAIT_MS, LOCK_MAX_RETRIES } from './lock-manager.js';
import { loadIgnorePatterns, listFilesRecursive, loadFileHashes, saveFileHashes } from './file-scanner.js';
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
  MAX_FILE_SIZE_BYTES,
  EMBEDDING_BATCH_SIZE,
  DEFAULT_SEARCH_LIMIT,
  DEFAULT_MIN_SCORE,
} from './constants.js';
import { grepSearch } from './grep-search.js';
import { mergeWithRrf } from './ranking.js';

const execFileAsync = promisify(execFile);

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

  onProgress(callback: ProgressCallback): void {
    this.progressCallbacks.push(callback);
  }

  offProgress(callback: ProgressCallback): void {
    this.progressCallbacks = this.progressCallbacks.filter((cb) => cb !== callback);
  }

  isEnabled(): boolean {
    if (this.config.enabled === false) return false;
    return this.embeddingService.isConfigured();
  }

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

  async getIndexStats(workspacePath: string): Promise<IndexStats | null> {
    if (!this.isEnabled()) return null;
    const indexPath = await this.resolveIndexPath(workspacePath);
    const vectorSize = this.embeddingService.getDimensions();
    const store = new LanceDBStore({ dbPath: indexPath, vectorSize });
    try {
      await store.initialize();
      const complete = await store.isIndexComplete();
      const hasData = await store.hasData();
      const fileCount = await store.getIndexedFileCount();
      await store.close();
      if (!complete || !hasData) return null;
      return { fileCount };
    } catch {
      await store.close().catch(() => {});
      return null;
    }
  }

  async indexWorkspace(workspacePath: string, options?: IndexOptions): Promise<IndexState> {
    const force = options?.force ?? false;

    if (!this.isEnabled()) {
      this.setStatus(workspacePath, 'standby', 'Code index is disabled', 0, 0);
      return this.getIndexStatus(workspacePath);
    }

    const indexPath = await this.resolveIndexPath(workspacePath);
    const vectorSize = this.embeddingService.getDimensions();

    // Acquire exclusive lock; retry up to LOCK_MAX_RETRIES times
    let releaseLock: (() => Promise<void>) | null = null;
    for (let attempt = 0; attempt < LOCK_MAX_RETRIES; attempt++) {
      releaseLock = await acquireLock(indexPath);
      if (releaseLock) break;
      // Another process is indexing; if already complete, skip
      const checkStore = new LanceDBStore({ dbPath: indexPath, vectorSize });
      try {
        await checkStore.initialize();
        const complete = await checkStore.isIndexComplete();
        const fileCount = await checkStore.getIndexedFileCount();
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
      const indexDir = this.getIndexDir();
      const ignoreInstance = await loadIgnorePatterns(workspacePath, indexDir);
      const filePaths = await listFilesRecursive(workspacePath, workspacePath, ignoreInstance);
      const total = filePaths.length;
      this.setStatus(workspacePath, 'indexing', 'Initializing store...', 0, total);

      await store.initialize();
      if (!force) {
        await store.markIndexingIncomplete();
      }

      const prevHashes = force ? {} : await loadFileHashes(indexPath, workspacePath);
      const currentHashes: Record<string, string> = {};
      const toIndex: string[] = [];
      const toDelete: string[] = [];
      const contentCache = new Map<string, string>();

      for (const relPath of filePaths) {
        const absPath = join(workspacePath, relPath);
        let fileStat;
        try {
          fileStat = await stat(absPath);
        } catch {
          continue;
        }
        if (!fileStat.isFile() || fileStat.size > MAX_FILE_SIZE_BYTES) continue;
        const content = await readFile(absPath, 'utf-8');
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
          const content = cached ?? await readFile(join(workspacePath, relPath), 'utf-8');
          if (cached) contentCache.delete(relPath);
          const fileHash = currentHashes[relPath]!;
          const blocks = await chunkFileWithAst(relPath, content, fileHash);
          allBlocks.push(...blocks);
        }
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

      await saveFileHashes(indexPath, workspacePath, currentHashes);
      await store.markIndexingComplete(total);
      await store.optimize();
      await store.createFtsIndex();
      await store.close();
      await releaseLock();
      this.setStatus(workspacePath, 'indexed', 'Index complete', total, total);
      return this.getIndexStatus(workspacePath);
    } catch (err) {
      await releaseLock();
      const message = err instanceof Error ? err.message : String(err);
      this.setStatus(workspacePath, 'error', message, 0, 0);
      await store.close().catch(() => {});
      return this.getIndexStatus(workspacePath);
    }
  }

  async searchWorkspace(
    workspacePath: string,
    query: string,
    options?: SearchOptions,
  ): Promise<SearchResult[]> {
    const mode = options?.mode ?? 'hybrid';
    const limit = options?.limit ?? DEFAULT_SEARCH_LIMIT;
    const grepOpts = {
      workspacePath,
      query,
      pathPrefix: options?.pathPrefix,
      limit,
    };

    // Pure grep — no index needed
    if (mode === 'grep') {
      return grepSearch(grepOpts);
    }

    // FTS and vector require an enabled index
    if (mode === 'fts' || mode === 'vector') {
      if (!this.isEnabled()) return [];
      return this.searchWithStore(workspacePath, query, mode, options);
    }

    // Hybrid mode: use all available channels
    const indexAvailable = this.isEnabled() && (await this.hasIndexSafe(workspacePath));

    if (!indexAvailable) {
      return grepSearch(grepOpts);
    }

    // Full hybrid: vector(1.0) + fts(0.5) + grep(0.5)
    const overfetchLimit = Math.max(limit * 3, 50);
    const indexPath = await this.resolveIndexPath(workspacePath);
    const vectorSize = this.embeddingService.getDimensions();
    const store = new LanceDBStore({ dbPath: indexPath, vectorSize });

    try {
      await store.initialize();
      if (!(await store.hasData())) {
        await store.close();
        return grepSearch(grepOpts);
      }

      const [queryVector] = await this.embeddingService.embedBatch([query]);
      const storeOpts = {
        pathPrefix: options?.pathPrefix,
        limit: overfetchLimit,
        minScore: options?.minScore ?? DEFAULT_MIN_SCORE,
      };

      const [vectorResults, ftsResults, grepResults] = await Promise.all([
        store.search(queryVector!, storeOpts),
        store.ftsSearch(query, storeOpts),
        grepSearch({ ...grepOpts, limit: overfetchLimit }),
      ]);

      await store.close();

      return mergeWithRrf(
        [
          { results: vectorResults, weight: 1.0 },
          { results: ftsResults, weight: 0.5 },
          { results: grepResults, weight: 0.5 },
        ],
        { limit },
      );
    } catch (err) {
      console.warn('[CodeIndexer] hybrid search failed, falling back to grep:', (err as Error).message);
      await store.close().catch(() => {});
      return grepSearch(grepOpts);
    }
  }

  /**
   * Store-based search for fts/vector modes (requires enabled index).
   */
  private async searchWithStore(
    workspacePath: string,
    query: string,
    mode: 'fts' | 'vector',
    options?: SearchOptions,
  ): Promise<SearchResult[]> {
    const indexPath = await this.resolveIndexPath(workspacePath);
    const vectorSize = this.embeddingService.getDimensions();
    const store = new LanceDBStore({ dbPath: indexPath, vectorSize });

    try {
      await store.initialize();
      if (!(await store.hasData())) {
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
      } else {
        const [queryVector] = await this.embeddingService.embedBatch([query]);
        results = await store.search(queryVector!, searchOpts);
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
   * Check if index exists, returning false on any error.
   */
  private async hasIndexSafe(workspacePath: string): Promise<boolean> {
    try {
      return await this.hasIndex(workspacePath);
    } catch {
      return false;
    }
  }

  async hasIndex(workspacePath: string): Promise<boolean> {
    if (!this.isEnabled()) return false;
    const indexPath = await this.resolveIndexPath(workspacePath);
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

  async listIndexedFiles(workspacePath: string): Promise<string[]> {
    if (!this.isEnabled()) return [];
    const indexPath = await this.resolveIndexPath(workspacePath);
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

  async listChunksInIndex(
    workspacePath: string,
    pathFilter: string,
    limit: number,
  ): Promise<DebugChunkEntry[]> {
    if (!this.isEnabled()) return [];
    const indexPath = await this.resolveIndexPath(workspacePath);
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

  async rechunkFileForDebug(
    workspacePath: string,
    relativePath: string,
    limit = 50,
  ): Promise<DebugChunkEntry[]> {
    const absPath = join(workspacePath, relativePath);
    try {
      const fileStat = await stat(absPath);
      if (!fileStat.isFile() || fileStat.size > MAX_FILE_SIZE_BYTES) {
        return [];
      }
      const content = await readFile(absPath, 'utf-8');
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

  /**
   * Force-releases a stale index lock for a workspace.
   */
  async releaseLock(workspacePath: string): Promise<boolean> {
    const indexPath = await this.resolveIndexPath(workspacePath);
    const released = await releaseLockFile(indexPath);
    if (released) this.setStatus(workspacePath, 'standby', '', 0, 0);
    return released;
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

  private async resolveIndexPath(workspacePath: string): Promise<string> {
    const sharedBase = this.getSharedIndexBaseDir();
    if (sharedBase) {
      try {
        const { stdout } = await execFileAsync('git', ['remote', 'get-url', 'origin'], {
          cwd: workspacePath,
          encoding: 'utf-8',
          timeout: 3000,
        });
        const remoteUrl = stdout.trim();
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
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
