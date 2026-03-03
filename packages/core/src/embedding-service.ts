/**
 * OpenAI-compatible embedding client for codebase indexing.
 * Uses fetch, batch processing, and retry with exponential backoff.
 */

import type { ResolvedEmbeddingConfig } from './config.js';

interface EmbeddingResponse {
  data: Array<{
    embedding: number[];
    index: number;
  }>;
  model: string;
  usage?: {
    prompt_tokens: number;
    total_tokens: number;
  };
}

const MAX_ATTEMPTS = 3;
const RETRY_DELAYS = [1000, 2000, 4000];

export class EmbeddingService {
  private readonly config: ResolvedEmbeddingConfig;

  constructor(config: ResolvedEmbeddingConfig) {
    this.config = config;
  }

  /**
   * Embed a single text.
   */
  async embedOne(text: string): Promise<number[]> {
    const results = await this.embedBatch([text]);
    return results[0]!;
  }

  /**
   * Embed multiple texts in batches. Preserves order.
   */
  async embedBatch(texts: string[]): Promise<number[][]> {
    const results: number[][] = [];

    for (let i = 0; i < texts.length; i += this.config.batchSize) {
      const batch = texts.slice(i, i + this.config.batchSize);
      const embeddings = await this.callApi(batch);
      results.push(...embeddings);
    }

    return results;
  }

  /**
   * Returns the embedding dimension used by the configured model.
   */
  getDimensions(): number {
    return this.config.dimensions;
  }

  /**
   * Returns true if embedding is configured (API key set).
   */
  isConfigured(): boolean {
    return Boolean(this.config.apiKey);
  }

  private async callApi(texts: string[], attempt = 0): Promise<number[][]> {
    if (!this.config.apiKey) {
      throw new Error('Embedding API key is not configured');
    }

    const body: Record<string, unknown> = {
      input: texts,
      model: this.config.model,
    };

    // Matryoshka: only send dimensions when not the default (avoid unnecessary truncation)
    if (this.config.dimensions !== 1536 && this.config.dimensions !== 4096) {
      body.dimensions = this.config.dimensions;
    }

    try {
      const response = await fetch(`${this.config.baseUrl}/embeddings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Embedding API error ${response.status}: ${text}`);
      }

      const data = (await response.json()) as EmbeddingResponse;
      return (data.data ?? [])
        .sort((a, b) => a.index - b.index)
        .map((d) => d.embedding);
    } catch (err) {
      if (attempt < MAX_ATTEMPTS - 1) {
        const delay = RETRY_DELAYS[attempt]!;
        console.warn(
          `[EmbeddingService] Attempt ${attempt + 1} failed, retrying in ${delay}ms:`,
          (err as Error).message,
        );
        await new Promise((r) => setTimeout(r, delay));
        return this.callApi(texts, attempt + 1);
      }
      throw err;
    }
  }
}
