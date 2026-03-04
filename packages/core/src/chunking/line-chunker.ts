import type { CodeBlock } from '../types.js';
import {
  MAX_CHUNK_CHARS,
  MIN_CHUNK_CHARS,
  MIN_CHUNK_REMAINDER_CHARS,
  MAX_CHARS_TOLERANCE_FACTOR,
} from '../constants.js';
import { detectLanguageFromPath, createSegmentHash, type ChunkTextOptions } from './utils.js';

/**
 * Chunk a file's content into code blocks by line boundaries.
 * Oversized lines are split by character. Re-balances to avoid tiny remainder chunks.
 */
export function chunkFile(
  filePath: string,
  content: string,
  fileHash: string,
): CodeBlock[] {
  const seenSegmentHashes = new Set<string>();
  const lines = content.split('\n');
  const baseStartLine = 1;
  return chunkTextByLines(filePath, fileHash, lines, seenSegmentHashes, baseStartLine);
}

export function chunkTextByLines(
  filePath: string,
  fileHash: string,
  lines: string[],
  seenSegmentHashes: Set<string>,
  baseStartLine: number,
  options?: ChunkTextOptions,
): CodeBlock[] {
  const chunks: CodeBlock[] = [];
  const effectiveMaxChars = Math.floor(MAX_CHUNK_CHARS * MAX_CHARS_TOLERANCE_FACTOR);
  const prefix = options?.contextPrefix ?? '';
  const prefixLength = prefix ? prefix.length + 1 : 0; // +1 for newline separator
  const adjustedMax = effectiveMaxChars - prefixLength;
  let currentChunkLines: string[] = [];
  let currentChunkLength = 0;
  let chunkStartLineIndex = 0;
  let chunkIndex = 0;

  const finalizeChunk = (endLineIndex: number) => {
    if (currentChunkLength >= MIN_CHUNK_CHARS && currentChunkLines.length > 0) {
      const rawContent = currentChunkLines.join('\n');
      // Add context prefix to continuation sub-chunks (not the first one)
      const chunkContent = (prefix && chunkIndex > 0)
        ? `${prefix}\n${rawContent}`
        : rawContent;
      const startLine = baseStartLine + chunkStartLineIndex;
      const endLine = baseStartLine + endLineIndex;
      const segmentHash = createSegmentHash(filePath, startLine, endLine, chunkContent);

      if (!seenSegmentHashes.has(segmentHash)) {
        seenSegmentHashes.add(segmentHash);
        chunks.push({
          file_path: filePath,
          start_line: startLine,
          end_line: endLine,
          content: chunkContent,
          file_hash: fileHash,
          segment_hash: segmentHash,
          language: detectLanguageFromPath(filePath),
          kind: (prefix && chunkIndex > 0) ? 'continuation' : (options?.kind),
          symbol: options?.symbol,
          parentScope: (prefix && chunkIndex > 0)
            ? [options?.parentScope, options?.symbol].filter(Boolean).join('.')
            : options?.parentScope,
        });
      }
      chunkIndex++;
    }
    currentChunkLines = [];
    currentChunkLength = 0;
    chunkStartLineIndex = endLineIndex + 1;
  };

  const createSegmentBlock = (
    segment: string,
    originalLineNumber: number,
  ) => {
    const segmentHash = createSegmentHash(filePath, originalLineNumber, originalLineNumber, segment);

    if (!seenSegmentHashes.has(segmentHash)) {
      seenSegmentHashes.add(segmentHash);
      chunks.push({
        file_path: filePath,
        start_line: originalLineNumber,
        end_line: originalLineNumber,
        content: segment,
        file_hash: fileHash,
        segment_hash: segmentHash,
        language: detectLanguageFromPath(filePath),
        kind: options?.kind,
        symbol: options?.symbol,
        parentScope: options?.parentScope,
      });
    }
  };

  const maxForLines = adjustedMax > MIN_CHUNK_CHARS ? adjustedMax : effectiveMaxChars;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const lineLength = line.length + (i < lines.length - 1 ? 1 : 0);
    const originalLineNumber = baseStartLine + i;

    if (lineLength > maxForLines) {
      if (currentChunkLines.length > 0) {
        finalizeChunk(i - 1);
      }
      let remainingLineContent = line;
      while (remainingLineContent.length > 0) {
        const segment = remainingLineContent.substring(0, MAX_CHUNK_CHARS);
        remainingLineContent = remainingLineContent.substring(MAX_CHUNK_CHARS);
        createSegmentBlock(segment, originalLineNumber);
      }
      chunkStartLineIndex = i + 1;
      continue;
    }

    if (currentChunkLength > 0 && currentChunkLength + lineLength > maxForLines) {
      let remainderLength = 0;
      for (let j = i; j < lines.length; j++) {
        remainderLength += lines[j]!.length + (j < lines.length - 1 ? 1 : 0);
      }

      let splitIndex = i - 1;
      if (
        currentChunkLength >= MIN_CHUNK_CHARS &&
        remainderLength < MIN_CHUNK_REMAINDER_CHARS &&
        currentChunkLines.length > 1
      ) {
        for (let k = i - 2; k >= chunkStartLineIndex; k--) {
          const potentialChunkLines = lines.slice(chunkStartLineIndex, k + 1);
          const potentialChunkLength = potentialChunkLines.join('\n').length + 1;
          const potentialNextChunkLines = lines.slice(k + 1);
          const potentialNextChunkLength = potentialNextChunkLines.join('\n').length + 1;
          if (
            potentialChunkLength >= MIN_CHUNK_CHARS &&
            potentialNextChunkLength >= MIN_CHUNK_REMAINDER_CHARS
          ) {
            splitIndex = k;
            break;
          }
        }
      }

      finalizeChunk(splitIndex);

      if (i >= chunkStartLineIndex) {
        currentChunkLines.push(line);
        currentChunkLength += lineLength;
      } else {
        i = chunkStartLineIndex - 1;
        continue;
      }
    } else {
      currentChunkLines.push(line);
      currentChunkLength += lineLength;
    }
  }

  if (currentChunkLines.length > 0) {
    finalizeChunk(lines.length - 1);
  }

  return chunks;
}
