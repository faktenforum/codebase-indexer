/**
 * LanceDB embedded vector store for code index (per workspace).
 */

import { mkdirSync, existsSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { CodeBlock, SearchResult, ChunkKind } from './types.js';
import { DEFAULT_SEARCH_LIMIT, DEFAULT_MIN_SCORE } from './constants.js';

const VECTOR_TABLE_NAME = 'vector';
const METADATA_TABLE_NAME = 'metadata';
const METADATA_JSON = 'metadata.json';

interface MetadataJson {
  vector_size: number;
  indexing_complete: boolean;
  last_indexed_at: string;
  indexed_file_count?: number;
}

function escapeSqlString(value: string): string {
  return value.replace(/'/g, "''");
}

function escapeSqlLikePattern(pattern: string): string {
  let escaped = escapeSqlString(pattern);
  escaped = escaped.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
  return escaped;
}

export interface LanceDBStoreConfig {
  dbPath: string;
  vectorSize: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LanceConnection = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LanceTable = any;

export class LanceDBStore {
  private readonly dbPath: string;
  private readonly vectorSize: number;
  private db: LanceConnection | null = null;
  private table: LanceTable | null = null;

  constructor(config: LanceDBStoreConfig) {
    this.dbPath = config.dbPath;
    this.vectorSize = config.vectorSize;
  }

  private async getLanceDB(): Promise<typeof import('@lancedb/lancedb')> {
    const lancedb = await import('@lancedb/lancedb');
    return lancedb;
  }

  private async getDb() {
    if (this.db) return this.db;
    const lancedb = await this.getLanceDB();
    if (!existsSync(this.dbPath)) {
      mkdirSync(this.dbPath, { recursive: true });
    }
    this.db = await lancedb.connect(this.dbPath);
    return this.db;
  }

  private async getTable() {
    if (this.table) return this.table;
    const db = await this.getDb();
    const tableNames = await db.tableNames();
    if (!tableNames.includes(VECTOR_TABLE_NAME)) {
      throw new Error('Code index table does not exist; run indexing first.');
    }
    this.table = await db.openTable(VECTOR_TABLE_NAME);
    return this.table;
  }

  async initialize(): Promise<void> {
    if (!existsSync(this.dbPath)) {
      mkdirSync(this.dbPath, { recursive: true });
    }
    const db = await this.getDb();
    const tableNames = await db.tableNames();
    const vectorExists = tableNames.includes(VECTOR_TABLE_NAME);
    const metadataExists = tableNames.includes(METADATA_TABLE_NAME);

    if (!vectorExists) {
      await this.createVectorTable(db);
      await this.createMetadataTable(db);
      return;
    }

    this.table = await db.openTable(VECTOR_TABLE_NAME);
    if (!this.readMetadata() && metadataExists) {
      try {
        const metaTable = await db.openTable(METADATA_TABLE_NAME);
        const rows = await metaTable.query().toArray();
        const byKey: Record<string, unknown> = {};
        for (const r of rows as { key: string; value: unknown }[]) byKey[r.key] = r.value;
        this.writeMetadata({
          vector_size: (byKey.vector_size as number) ?? this.vectorSize,
          indexing_complete: (byKey.indexing_complete as boolean) ?? false,
          last_indexed_at: (byKey.last_indexed_at as string) ?? new Date().toISOString(),
        });
      } catch {
        this.writeMetadata({
          vector_size: this.vectorSize,
          indexing_complete: false,
          last_indexed_at: new Date().toISOString(),
        });
      }
    }
    const storedSize = await this.getStoredVectorSize(db);
    if (storedSize !== null && storedSize !== this.vectorSize) {
      await this.dropTable(db, VECTOR_TABLE_NAME);
      await this.dropTable(db, METADATA_TABLE_NAME);
      if (existsSync(this.getMetadataPath())) rmSync(this.getMetadataPath());
      await this.createVectorTable(db);
      await this.createMetadataTable(db);
    }
  }

  private async createVectorTable(db: LanceConnection): Promise<void> {
    const sample = [
      {
        id: '__sample__',
        vector: new Array(this.vectorSize).fill(0),
        filePath: '',
        codeChunk: '',
        startLine: 0,
        endLine: 0,
        symbol: '',
        parentScope: '',
        kind: '',
      },
    ];
    this.table = await db.createTable(VECTOR_TABLE_NAME, sample);
    await this.table!.delete("id = '__sample__'");
  }

  private async createMetadataTable(db: LanceConnection): Promise<void> {
    await db.createTable(METADATA_TABLE_NAME, [
      { key: 'vector_size', value: this.vectorSize },
      { key: 'indexing_complete', value: false },
      { key: 'last_indexed_at', value: new Date().toISOString() },
    ]);
    this.writeMetadata({
      vector_size: this.vectorSize,
      indexing_complete: false,
      last_indexed_at: new Date().toISOString(),
    });
  }

  private async dropTable(db: LanceConnection, name: string): Promise<void> {
    const names = await db.tableNames();
    if (names.includes(name)) {
      await db.dropTable(name);
    }
  }

  private getMetadataPath(): string {
    return join(this.dbPath, METADATA_JSON);
  }

  private readMetadata(): MetadataJson | null {
    const path = this.getMetadataPath();
    if (!existsSync(path)) return null;
    try {
      const raw = readFileSync(path, 'utf-8');
      return JSON.parse(raw) as MetadataJson;
    } catch {
      return null;
    }
  }

  private writeMetadata(data: MetadataJson): void {
    if (!existsSync(this.dbPath)) mkdirSync(this.dbPath, { recursive: true });
    writeFileSync(this.getMetadataPath(), JSON.stringify(data), 'utf-8');
  }

  private async getStoredVectorSize(db: LanceConnection): Promise<number | null> {
    const meta = this.readMetadata();
    if (meta) return meta.vector_size;
    try {
      const metaTable = await db.openTable(METADATA_TABLE_NAME);
      const rows = await metaTable.query().where("key = 'vector_size'").toArray();
      return rows.length > 0 ? (rows[0] as { value: number }).value : null;
    } catch {
      return null;
    }
  }

  async upsert(blocks: CodeBlock[], vectors: number[][]): Promise<void> {
    if (blocks.length === 0) return;
    const table = await this.getTable();
    const rows = blocks.map((block, i) => ({
      id: block.segment_hash,
      vector: vectors[i],
      filePath: block.file_path,
      codeChunk: block.content,
      startLine: block.start_line,
      endLine: block.end_line,
      symbol: block.symbol ?? '',
      parentScope: block.parentScope ?? '',
      kind: block.kind ?? '',
    }));
    const ids = rows.map((r) => r.id);
    if (ids.length > 0) {
      const escaped = ids.map((id) => `'${escapeSqlString(id)}'`).join(', ');
      await table.delete(`id IN (${escaped})`);
    }
    await table.add(rows);
  }

  async deleteByFilePaths(filePaths: string[]): Promise<void> {
    if (filePaths.length === 0) return;
    const table = await this.getTable();
    const escaped = filePaths.map((fp) => `'${escapeSqlString(fp)}'`).join(', ');
    await table.delete(`filePath IN (${escaped})`);
  }

  async listChunksByPath(
    pathFilter: string,
    limit: number,
  ): Promise<
    Array<{ id: string; filePath: string; startLine: number; endLine: number; codeChunk: string; symbol: string; parentScope: string; kind: string }>
  > {
    try {
      const table = await this.getTable();
      const safeLimit = Math.max(1, Math.min(limit, 1000));
      let whereExpr: string;
      if (pathFilter.endsWith('/')) {
        const escapedPrefix = escapeSqlLikePattern(pathFilter);
        whereExpr = `filePath LIKE '${escapedPrefix}%'`;
      } else {
        const escapedPath = escapeSqlString(pathFilter);
        whereExpr = `filePath = '${escapedPath}'`;
      }
      const rows = await table.query().where(whereExpr).limit(safeLimit).toArray();
      return (rows as Array<{
        id: string;
        filePath: string;
        startLine: number;
        endLine: number;
        codeChunk: string;
        symbol: string;
        parentScope: string;
        kind: string;
      }>) ?? [];
    } catch {
      return [];
    }
  }

  async search(
    queryVector: number[],
    options?: { pathPrefix?: string; limit?: number; minScore?: number },
  ): Promise<SearchResult[]> {
    const table = await this.getTable();
    const limit = options?.limit ?? DEFAULT_SEARCH_LIMIT;
    const minScore = options?.minScore ?? DEFAULT_MIN_SCORE;
    let query = table.search(queryVector);
    if (options?.pathPrefix) {
      const escaped = escapeSqlLikePattern(options.pathPrefix);
      query = query.where(`filePath LIKE '${escaped}%'`);
    }
    const list: Array<{
      filePath: string;
      codeChunk: string;
      startLine: number;
      endLine: number;
      _distance?: number;
    }> = await query
      .distanceType('cosine')
      .distanceRange(0, 1 - minScore)
      .limit(limit)
      .toArray();

    return list.map((row) => ({
      file_path: row.filePath,
      score: 1 - (row._distance ?? 0),
      start_line: row.startLine,
      end_line: row.endLine,
      code_chunk: row.codeChunk,
    }));
  }

  /**
   * Create a Full-Text Search index on the codeChunk column.
   * Uses LanceDB's built-in Tantivy-based FTS.
   * Should be called after indexing is complete.
   */
  async createFtsIndex(): Promise<void> {
    try {
      const lancedb = await this.getLanceDB();
      const table = await this.getTable();
      await table.createIndex('codeChunk', {
        config: lancedb.Index.fts({
          baseTokenizer: 'simple',
          stem: false,
          lowercase: true,
          removeStopWords: false,
          withPosition: true,
        }),
        replace: true,
      });
    } catch (err) {
      console.warn('[LanceDBStore] createFtsIndex failed:', (err as Error).message);
    }
  }

  /**
   * Full-text search using the FTS index on codeChunk.
   */
  async ftsSearch(
    queryText: string,
    options?: { pathPrefix?: string; limit?: number },
  ): Promise<SearchResult[]> {
    const table = await this.getTable();
    const limit = options?.limit ?? DEFAULT_SEARCH_LIMIT;

    try {
      let query = table.search(queryText, 'fts', 'codeChunk');
      if (options?.pathPrefix) {
        const escaped = escapeSqlLikePattern(options.pathPrefix);
        query = query.where(`filePath LIKE '${escaped}%'`);
      }
      const list: Array<{
        id: string;
        filePath: string;
        codeChunk: string;
        startLine: number;
        endLine: number;
        _score?: number;
      }> = await query.limit(limit).toArray();

      return list.map((row, index) => ({
        file_path: row.filePath,
        score: row._score ?? 1 / (index + 1),
        start_line: row.startLine,
        end_line: row.endLine,
        code_chunk: row.codeChunk,
      }));
    } catch (err) {
      console.warn('[LanceDBStore] ftsSearch failed:', (err as Error).message);
      return [];
    }
  }

  /**
   * Hybrid search combining vector search and FTS with RRF (Reciprocal Rank Fusion).
   */
  async hybridSearch(
    queryVector: number[],
    queryText: string,
    options?: { pathPrefix?: string; limit?: number; minScore?: number },
  ): Promise<SearchResult[]> {
    const limit = options?.limit ?? DEFAULT_SEARCH_LIMIT;
    const overfetchLimit = Math.max(limit * 3, 50);

    // Run both searches in parallel
    const [vectorResults, ftsResults] = await Promise.all([
      this.search(queryVector, { ...options, limit: overfetchLimit }),
      this.ftsSearch(queryText, { pathPrefix: options?.pathPrefix, limit: overfetchLimit }),
    ]);

    // RRF merging (k = 60, standard constant)
    const k = 60;
    const scoreMap = new Map<string, { score: number; result: SearchResult }>();
    const chunkKey = (r: SearchResult) => `${r.file_path}:${r.start_line}-${r.end_line}`;

    const addRrfScores = (results: SearchResult[]) => {
      results.forEach((result, index) => {
        const key = chunkKey(result);
        const existing = scoreMap.get(key);
        const rrfScore = 1 / (k + index + 1);
        scoreMap.set(key, {
          score: (existing?.score ?? 0) + rrfScore,
          result: existing?.result ?? result,
        });
      });
    };

    addRrfScores(vectorResults);
    addRrfScores(ftsResults);

    return Array.from(scoreMap.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(({ score, result }) => ({ ...result, score }));
  }

  async markIndexingComplete(fileCount?: number): Promise<void> {
    const meta = this.readMetadata() ?? {
      vector_size: this.vectorSize,
      indexing_complete: false,
      last_indexed_at: '',
    };
    this.writeMetadata({
      ...meta,
      vector_size: meta.vector_size ?? this.vectorSize,
      indexing_complete: true,
      last_indexed_at: new Date().toISOString(),
      ...(fileCount !== undefined && { indexed_file_count: fileCount }),
    });
  }

  async markIndexingIncomplete(): Promise<void> {
    const meta = this.readMetadata() ?? {
      vector_size: this.vectorSize,
      indexing_complete: false,
      last_indexed_at: '',
    };
    this.writeMetadata({
      ...meta,
      vector_size: meta.vector_size ?? this.vectorSize,
      indexing_complete: false,
      last_indexed_at: meta.last_indexed_at || new Date().toISOString(),
    });
  }

  async isIndexComplete(): Promise<boolean> {
    const meta = this.readMetadata();
    return meta?.indexing_complete === true;
  }

  getIndexedFileCount(): number {
    const meta = this.readMetadata();
    return typeof meta?.indexed_file_count === 'number' ? meta.indexed_file_count : 0;
  }

  async hasData(): Promise<boolean> {
    try {
      const table = await this.getTable();
      const count = await table.countRows();
      return count > 0;
    } catch {
      return false;
    }
  }

  async optimize(): Promise<void> {
    try {
      const table = await this.getTable();
      await table.optimize({
        cleanupOlderThan: new Date(),
        deleteUnverified: false,
      });
    } catch (err) {
      console.warn('[LanceDBStore] optimize failed:', (err as Error).message);
    }
  }

  async close(): Promise<void> {
    this.table = null;
    if (this.db) {
      await this.db.close();
      this.db = null;
    }
  }

  async listDistinctFilePaths(): Promise<string[]> {
    try {
      const table = await this.getTable();
      const rows = await table.query().select(['filePath']).toArray();
      const paths = new Set<string>();
      for (const row of rows as Array<{ filePath: string }>) {
        if (row.filePath) paths.add(row.filePath);
      }
      return [...paths].sort();
    } catch {
      return [];
    }
  }

  async deleteAll(): Promise<void> {
    await this.close();
    if (existsSync(this.dbPath)) {
      rmSync(this.dbPath, { recursive: true, force: true });
    }
  }
}
