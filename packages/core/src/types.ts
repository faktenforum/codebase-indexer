/**
 * Types for codebase indexing (semantic code search).
 */

export type ChunkKind =
  | 'function'
  | 'method'
  | 'class'
  | 'interface'
  | 'type'
  | 'enum'
  | 'module'
  | 'namespace'
  | 'decorator'
  | 'continuation'
  | 'gap'
  | 'fallback';

export interface CodeBlock {
  file_path: string;
  start_line: number;
  end_line: number;
  content: string;
  file_hash: string;
  segment_hash: string;
  language?: string;
  /** Primary symbol defined in this chunk (e.g. function name) */
  symbol?: string;
  /** Enclosing scope path (e.g. "ClassName.methodName") */
  parentScope?: string;
  /** Semantic kind of this chunk */
  kind?: ChunkKind;
}

export interface SearchResult {
  file_path: string;
  score: number;
  start_line: number;
  end_line: number;
  code_chunk: string;
}

export interface DebugChunkEntry {
  file_path: string;
  start_line: number;
  end_line: number;
  content: string;
  segment_hash: string;
  char_count: number;
  symbol?: string;
  parentScope?: string;
  kind?: ChunkKind;
}

export type IndexStatus = 'standby' | 'indexing' | 'indexed' | 'error';

export interface IndexState {
  status: IndexStatus;
  message: string;
  files_processed: number;
  files_total: number;
}

export interface IndexStats {
  fileCount: number;
}

export type SearchMode = 'vector' | 'fts' | 'hybrid' | 'grep';

export interface SearchOptions {
  pathPrefix?: string;
  limit?: number;
  minScore?: number;
  mode?: SearchMode;
}

export interface IndexOptions {
  force?: boolean;
}

export type ProgressCallback = (state: IndexState) => void;
