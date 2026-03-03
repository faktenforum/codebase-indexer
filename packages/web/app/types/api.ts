export interface SearchRequest {
  query: string;
  workspacePath?: string;
  path?: string;
  limit?: number;
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
