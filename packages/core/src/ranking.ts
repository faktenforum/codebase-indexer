/**
 * Reciprocal Rank Fusion (RRF) merge utility for combining ranked result sets.
 */

import type { SearchResult } from './types.js';
import { DEFAULT_SEARCH_LIMIT } from './constants.js';

export function mergeWithRrf(
  resultSets: Array<{ results: SearchResult[]; weight: number }>,
  options?: { k?: number; limit?: number },
): SearchResult[] {
  const k = options?.k ?? 60;
  const limit = options?.limit ?? DEFAULT_SEARCH_LIMIT;
  const scoreMap = new Map<string, { score: number; result: SearchResult }>();
  const chunkKey = (r: SearchResult) => `${r.file_path}:${r.start_line}-${r.end_line}`;

  for (const { results, weight } of resultSets) {
    results.forEach((result, index) => {
      const key = chunkKey(result);
      const existing = scoreMap.get(key);
      const rrfScore = weight * (1 / (k + index + 1));
      scoreMap.set(key, {
        score: (existing?.score ?? 0) + rrfScore,
        result: existing?.result ?? result,
      });
    });
  }

  return Array.from(scoreMap.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ score, result }) => ({ ...result, score }));
}
