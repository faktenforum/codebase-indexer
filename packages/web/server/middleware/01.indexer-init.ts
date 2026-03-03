import { CodeIndexer, configFromEnv } from '@codebase-indexer/core';

let indexer: CodeIndexer | null = null;

export function useCodeIndexer(): CodeIndexer {
  if (!indexer) {
    indexer = new CodeIndexer(configFromEnv());
  }
  return indexer;
}

export function getWorkspacePath(): string {
  const config = useRuntimeConfig();
  return config.indexerWorkspacePath || process.cwd();
}

export default defineEventHandler(() => {
  // Ensure indexer is initialized on first request
  useCodeIndexer();
});
