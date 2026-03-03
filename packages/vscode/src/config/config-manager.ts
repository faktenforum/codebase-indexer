import * as vscode from 'vscode';
import type { CodeIndexConfig } from '@codebase-indexer/core';

export class ConfigManager {
  getConfig(): CodeIndexConfig {
    const config = vscode.workspace.getConfiguration('codebaseIndexer');
    return {
      embedding: {
        provider: config.get<string>('embedding.provider') || 'openrouter',
        apiKey: config.get<string>('embedding.apiKey') || '',
        model: config.get<string>('embedding.model') || 'openai/text-embedding-3-small',
        baseUrl: config.get<string>('embedding.baseUrl') || undefined,
        dimensions: config.get<number>('embedding.dimensions') || 1536,
      },
      indexDir: config.get<string>('indexDir') || '.codebase-indexer',
      enabled: true,
    };
  }

  isConfigured(): boolean {
    const config = this.getConfig();
    return Boolean(config.embedding.apiKey);
  }
}
