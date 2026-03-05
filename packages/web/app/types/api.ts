export type SearchMode = 'vector' | 'fts' | 'hybrid' | 'grep';

export interface SearchRequest {
  query: string;
  workspacePath?: string;
  path?: string;
  limit?: number;
  mode?: SearchMode;
}

export interface SearchResultItem {
  file_path: string;
  score: number;
  start_line: number;
  end_line: number;
  code_chunk: string;
}

export interface SearchResponse {
  results: SearchResultItem[];
}

export interface IndexRequest {
  workspacePath?: string;
  force?: boolean;
}

export interface IndexStatusResponse {
  status: 'standby' | 'indexing' | 'indexed' | 'error';
  message: string;
  files_processed: number;
  files_total: number;
}

export interface StatsResponse {
  fileCount: number | null;
  isEnabled: boolean;
  hasIndex: boolean;
}

export interface FilesResponse {
  files: string[];
}

export interface ChunkItem {
  file_path: string;
  start_line: number;
  end_line: number;
  content: string;
  segment_hash: string;
  char_count: number;
  symbol?: string;
  parentScope?: string;
  kind?: string;
}

export interface ChunksResponse {
  chunks: ChunkItem[];
}

export interface RechunkRequest {
  workspacePath: string;
  filePath: string;
  limit?: number;
}

export interface Workspace {
  path: string;
  addedAt: string;
}
