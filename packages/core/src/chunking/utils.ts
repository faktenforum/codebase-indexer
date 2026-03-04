import { createHash } from 'node:crypto';
import { extname } from 'node:path';
import type { ChunkKind } from '../types.js';

export function detectLanguageFromPath(filePath: string): string | undefined {
  const ext = extname(filePath).toLowerCase();
  if (!ext) return undefined;
  return ext.slice(1);
}

/**
 * Create SHA-256 hash of file content for change detection.
 */
export function createFileHash(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

export function createSegmentHash(
  filePath: string,
  startLine: number,
  endLine: number,
  content: string,
): string {
  const preview = content.slice(0, 100);
  return createHash('sha256')
    .update(`${filePath}-${startLine}-${endLine}-${content.length}-${preview}`)
    .digest('hex');
}

export interface ChunkTextOptions {
  kind?: ChunkKind;
  symbol?: string;
  parentScope?: string;
  contextPrefix?: string;
}
