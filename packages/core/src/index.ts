/**
 * @codebase-indexer/core
 *
 * Semantic code search engine using Tree-sitter, embeddings, and LanceDB.
 */

import { CodeIndexer } from './code-indexer.js';
import { configFromEnv } from './config.js';

// Main class
export { CodeIndexer } from './code-indexer.js';

// Configuration
export { configFromEnv, resolveEmbeddingConfig } from './config.js';
export type { CodeIndexConfig, EmbeddingConfig, ResolvedEmbeddingConfig } from './config.js';

// Types
export type {
  CodeBlock,
  ChunkKind,
  SearchResult,
  DebugChunkEntry,
  IndexStatus,
  IndexState,
  IndexStats,
  SearchOptions,
  SearchMode,
  IndexOptions,
  ProgressCallback,
} from './types.js';

// Sub-modules (for advanced usage)
export { EmbeddingService } from './embedding-service.js';
export { LanceDBStore } from './lancedb-store.js';
export type { LanceDBStoreConfig } from './lancedb-store.js';
export { chunkFile, chunkFileWithAst, createFileHash } from './chunking-service.js';
export { loadRequiredLanguageParsers } from './tree-sitter/language-loader.js';
export type { LanguageParser } from './tree-sitter/language-loader.js';

// Constants
export {
  DEFAULT_INDEX_DIR,
  DEFAULT_SEARCH_LIMIT,
  DEFAULT_MIN_SCORE,
  SUPPORTED_EXTENSIONS,
  SUPPORTED_FILENAMES,
  DIRS_TO_IGNORE,
  FILES_TO_IGNORE,
  MAX_CHUNK_CHARS,
  MIN_CHUNK_CHARS,
  MAX_FILE_SIZE_BYTES,
  EMBEDDING_BATCH_SIZE,
} from './constants.js';

/**
 * Convenience factory: create a CodeIndexer from environment variables.
 */
export function createFromEnv(): CodeIndexer {
  return new CodeIndexer(configFromEnv());
}
