/**
 * Configuration system for codebase indexer.
 * Replaces hardcoded process.env reads with injectable configuration.
 */

export interface EmbeddingConfig {
  provider?: 'openrouter' | 'scaleway' | string;
  baseUrl?: string;
  model?: string;
  apiKey: string;
  dimensions?: number;
  batchSize?: number;
}

export interface CodeIndexConfig {
  embedding: EmbeddingConfig;
  indexDir?: string;
  sharedIndexBaseDir?: string;
  enabled?: boolean;
}

export interface ResolvedEmbeddingConfig {
  baseUrl: string;
  model: string;
  apiKey: string;
  dimensions: number;
  batchSize: number;
}

const DEFAULT_DIMENSIONS = 1536;
const DEFAULT_BATCH_SIZE = 32;

export function resolveEmbeddingConfig(config: EmbeddingConfig): ResolvedEmbeddingConfig {
  const provider = config.provider ?? 'openrouter';
  const baseUrl =
    config.baseUrl ??
    (provider === 'scaleway' ? 'https://api.scaleway.ai/v1' : 'https://openrouter.ai/api/v1');
  const model =
    config.model ??
    (provider === 'scaleway' ? 'qwen3-embedding-8b' : 'openai/text-embedding-3-small');
  const dimensions = config.dimensions ?? DEFAULT_DIMENSIONS;
  const batchSize = config.batchSize ?? DEFAULT_BATCH_SIZE;

  return {
    baseUrl: baseUrl.replace(/\/$/, ''),
    model,
    apiKey: config.apiKey,
    dimensions: Number.isFinite(dimensions) ? dimensions : DEFAULT_DIMENSIONS,
    batchSize: Number.isFinite(batchSize) && batchSize > 0 ? batchSize : DEFAULT_BATCH_SIZE,
  };
}

/**
 * Create a CodeIndexConfig from environment variables (backwards compatibility).
 */
export function configFromEnv(): CodeIndexConfig {
  return {
    embedding: {
      provider: process.env.CODE_INDEX_EMBEDDING_PROVIDER ?? 'openrouter',
      baseUrl: process.env.CODE_INDEX_EMBEDDING_BASE_URL,
      model: process.env.CODE_INDEX_EMBEDDING_MODEL,
      apiKey: process.env.CODE_INDEX_EMBEDDING_API_KEY ?? '',
      dimensions: parseInt(process.env.CODE_INDEX_EMBEDDING_DIMENSIONS ?? '', 10) || undefined,
      batchSize: parseInt(process.env.CODE_INDEX_EMBEDDING_BATCH_SIZE ?? '', 10) || undefined,
    },
    indexDir: process.env.CODE_INDEX_INDEX_DIR,
    sharedIndexBaseDir: process.env.CODE_INDEX_SHARED_DIR,
    enabled: process.env.CODE_INDEX_ENABLED !== 'false',
  };
}
