// The AST-based chunking flow and helpers are inspired by Kilo Code's CodeParser
// (kilocode/src/services/code-index/processors/parser.ts) and reuse the same
// min/max character heuristics. Kilo Code is licensed under the Apache License,
// Version 2.0; see the upstream LICENSE for full terms.
//
// The parent-scope context prefix and symbol metadata extraction are inspired
// by aider's TreeContext approach (aider/repomap.py) and the docs-mcp-server's
// hierarchical metadata strategy (docs-mcp-server/src/splitter/).

import { extname } from 'node:path';
import type { CodeBlock } from '../types.js';
import {
  MAX_CHUNK_CHARS,
  MIN_CHUNK_CHARS,
  MAX_CHARS_TOLERANCE_FACTOR,
  MERGE_MAX_CHUNK_CHARS,
} from '../constants.js';
import { loadRequiredLanguageParsers } from '../tree-sitter/language-loader.js';
import { detectLanguageFromPath, createSegmentHash } from './utils.js';
import { chunkFile, chunkTextByLines } from './line-chunker.js';
import {
  captureNameToKind,
  extractSignature,
  buildParentScope,
  collectPrecedingComments,
  type CapturedNode,
} from './ast-helpers.js';

// Extensions that use AST-aware chunking (tree-sitter) before falling back to line-based chunking.
const AST_SUPPORTED_EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.mts',
  '.cts',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.json',
  '.md',
  '.markdown',
  '.html',
  '.htm',
  '.css',
  '.py',
  '.java',
  '.rs',
  '.c',
  '.h',
  '.cpp',
  '.hpp',
  '.go',
  '.kt',
  '.rb',
  '.php',
  '.swift',
  '.cs',
  '.vue',
  '.vala',
  '.vapi',
  '.svelte',
  '.sh',
  '.bash',
  '.zsh',
  '.scala',
  '.lua',
  '.zig',
  '.toml',
  '.yaml',
  '.yml',
  '.ex',
  '.exs',
  '.sql',
  '.graphql',
]);

/**
 * Process AST-captured nodes into chunks with metadata.
 * When a node is too large, it splits by lines and adds a signature
 * prefix to continuation sub-chunks so they retain context.
 * Preceding JSDoc/comments are included with their node.
 */
function processAstNodes(
  captured: CapturedNode[],
  filePath: string,
  fileHash: string,
  fileContent: string,
  seenSegmentHashes: Set<string>,
): CodeBlock[] {
  const results: CodeBlock[] = [];
  const maxAllowed = Math.floor(MAX_CHUNK_CHARS * MAX_CHARS_TOLERANCE_FACTOR);
  const allLines = fileContent.split('\n');

  for (const { node, symbol, kind } of captured) {
    const parentScope = buildParentScope(node);

    // Include preceding comments (JSDoc, etc.) with this node
    const precedingComments = collectPrecedingComments(node);
    const effectiveStartRow = precedingComments.length > 0
      ? precedingComments[0]!.startPosition.row
      : node.startPosition.row;
    const effectiveStartLine = effectiveStartRow + 1;
    const endLine = node.endPosition.row + 1;

    // Build full content: comments + node
    const fullContent = allLines.slice(effectiveStartRow, node.endPosition.row + 1).join('\n');
    const length = fullContent.length;

    if (length < MIN_CHUNK_CHARS) {
      continue;
    }

    if (length > maxAllowed) {
      // Node too large — split by lines with signature prefix for continuations
      const signature = extractSignature(node.text);
      const contextPrefix = `// Context: ${parentScope ? parentScope + '.' : ''}${symbol ?? '(anonymous)'}\n${signature}`;
      const contentLines = allLines.slice(effectiveStartRow, node.endPosition.row + 1);

      const subChunks = chunkTextByLines(
        filePath,
        fileHash,
        contentLines,
        seenSegmentHashes,
        effectiveStartLine,
        {
          kind,
          symbol,
          parentScope,
          contextPrefix,
        },
      );
      results.push(...subChunks);
    } else {
      const segmentHash = createSegmentHash(filePath, effectiveStartLine, endLine, fullContent);

      if (!seenSegmentHashes.has(segmentHash)) {
        seenSegmentHashes.add(segmentHash);
        results.push({
          file_path: filePath,
          start_line: effectiveStartLine,
          end_line: endLine,
          content: fullContent,
          file_hash: fileHash,
          segment_hash: segmentHash,
          language: detectLanguageFromPath(filePath),
          kind,
          symbol,
          parentScope,
        });
      }
    }
  }

  return results;
}

/**
 * Fill gaps between AST chunks with line-based chunks.
 * This ensures imports, top-level statements, and comments are indexed.
 */
function fillGaps(
  astChunks: CodeBlock[],
  allLines: string[],
  filePath: string,
  fileHash: string,
  seenSegmentHashes: Set<string>,
): CodeBlock[] {
  if (astChunks.length === 0) return [];

  // Sort AST chunks by start line
  const sorted = [...astChunks].sort((a, b) => a.start_line - b.start_line);
  const gapChunks: CodeBlock[] = [];

  const addGap = (gapLines: string[], startLine: number) => {
    const gapText = gapLines.join('\n');
    if (gapText.length >= MIN_CHUNK_CHARS) {
      const chunks = chunkTextByLines(filePath, fileHash, gapLines, seenSegmentHashes, startLine, {
        kind: 'gap',
      });
      gapChunks.push(...chunks);
    }
  };

  // Gap before first AST chunk (e.g. imports, comments at top of file)
  if (sorted[0]!.start_line > 1) {
    addGap(allLines.slice(0, sorted[0]!.start_line - 1), 1);
  }

  // Gaps between consecutive AST chunks
  for (let i = 0; i < sorted.length - 1; i++) {
    const gapStart = sorted[i]!.end_line; // line after current chunk ends
    const gapEnd = sorted[i + 1]!.start_line - 1; // line before next chunk starts

    if (gapEnd > gapStart) {
      addGap(allLines.slice(gapStart, gapEnd), gapStart + 1);
    }
  }

  // Gap after last AST chunk (trailing code)
  const lastChunk = sorted[sorted.length - 1]!;
  if (lastChunk.end_line < allLines.length) {
    addGap(allLines.slice(lastChunk.end_line), lastChunk.end_line + 1);
  }

  return gapChunks;
}

/**
 * Greedy merge: combine adjacent small chunks into larger ones.
 * Inspired by docs-mcp-server's GreedySplitter — small chunks are
 * concatenated with their neighbors as long as combined size stays
 * within MAX_CHUNK_CHARS. Only merges chunks of the same semantic
 * level (both gap chunks, or both continuations in the same scope).
 */
function mergeSmallChunks(chunks: CodeBlock[], fileHash: string): CodeBlock[] {
  if (chunks.length <= 1) return chunks;

  const maxAllowed = Math.floor(MAX_CHUNK_CHARS * MAX_CHARS_TOLERANCE_FACTOR);
  const merged: CodeBlock[] = [];
  let current: CodeBlock | null = null;

  for (const chunk of chunks) {
    if (!current) {
      current = { ...chunk };
      continue;
    }

    const canMerge =
      // Both are small enough to consider merging
      current.content.length < MERGE_MAX_CHUNK_CHARS &&
      chunk.content.length < MERGE_MAX_CHUNK_CHARS &&
      // Combined size is within limits
      current.content.length + chunk.content.length + 1 <= maxAllowed &&
      // Same file (always true here, but defensive)
      current.file_path === chunk.file_path &&
      // Adjacent (no gap between them, or at most 1 line)
      chunk.start_line <= current.end_line + 2 &&
      // Never merge two chunks that each have their own symbol (different definitions)
      !(current.symbol && chunk.symbol && current.symbol !== chunk.symbol) &&
      // Compatible kinds: merge gaps with gaps, or symbolless chunks
      (current.kind === chunk.kind ||
        (current.kind === 'gap' && chunk.kind === 'gap') ||
        (!current.symbol && !chunk.symbol));

    if (canMerge) {
      const mergedContent: string = current.content + '\n' + chunk.content;
      const segmentHash = createSegmentHash(
        current.file_path,
        current.start_line,
        chunk.end_line,
        mergedContent,
      );
      current = {
        ...current,
        end_line: chunk.end_line,
        content: mergedContent,
        segment_hash: segmentHash,
        // Keep the more specific symbol/kind
        symbol: current.symbol || chunk.symbol,
        kind: current.kind === 'gap' && chunk.kind !== 'gap' ? chunk.kind : current.kind,
        parentScope: current.parentScope || chunk.parentScope,
      };
    } else {
      merged.push(current);
      current = { ...chunk };
    }
  }

  if (current) {
    merged.push(current);
  }

  return merged;
}

/**
 * AST-aware chunking using tree-sitter for a subset of languages,
 * with gap-filling for code between AST nodes (imports, top-level
 * statements), greedy merging of small chunks, and a guaranteed
 * fallback to line-based chunking.
 *
 * Each chunk is enriched with metadata:
 * - symbol: primary symbol name (function, class, etc.)
 * - parentScope: enclosing scope path (e.g. "ClassName.methodName")
 * - kind: semantic type of the chunk
 *
 * When large functions/classes exceed MAX_CHUNK_CHARS, sub-chunks
 * get a signature prefix so they retain context about their parent.
 */
export async function chunkFileWithAst(
  filePath: string,
  content: string,
  fileHash: string,
): Promise<CodeBlock[]> {
  const ext = extname(filePath).toLowerCase();

  if (!AST_SUPPORTED_EXTENSIONS.has(ext)) {
    return chunkFile(filePath, content, fileHash);
  }

  const seenSegmentHashes = new Set<string>();

  try {
    const parsers = await loadRequiredLanguageParsers([filePath]);
    const key = ext.slice(1);
    const language = parsers[key];
    if (!language) {
      return chunkFile(filePath, content, fileHash);
    }

    const tree = language.parser.parse(content);
    const captures = tree ? language.query.captures(tree.rootNode) : [];

    if (!captures || captures.length === 0) {
      return chunkFile(filePath, content, fileHash);
    }

    // 1. Extract captured nodes with symbol metadata
    const capturedNodes: CapturedNode[] = [];
    const seenNodeIds = new Set<number>();

    for (let i = 0; i < captures.length; i++) {
      const capture = captures[i]!;
      const name = capture.name;

      // Skip @name.* captures — we only process @definition.* captures
      if (name.startsWith('name.')) continue;

      // Deduplicate by node id (same node can be captured by multiple patterns)
      const nodeId = capture.node.id;
      if (seenNodeIds.has(nodeId)) continue;
      seenNodeIds.add(nodeId);

      // Find the corresponding @name.* capture for this definition
      let symbol: string | undefined;
      for (let j = 0; j < captures.length; j++) {
        const other = captures[j]!;
        if (
          other.name.startsWith('name.') &&
          other.node.startPosition.row >= capture.node.startPosition.row &&
          other.node.endPosition.row <= capture.node.endPosition.row
        ) {
          symbol = other.node.text;
          break;
        }
      }

      capturedNodes.push({
        node: capture.node,
        symbol,
        kind: captureNameToKind(name),
      });
    }

    if (capturedNodes.length === 0) {
      return chunkFile(filePath, content, fileHash);
    }

    // 2. Filter nodes to avoid overlap
    const maxAllowed = Math.floor(MAX_CHUNK_CHARS * MAX_CHARS_TOLERANCE_FACTOR);

    const filteredNodes = capturedNodes.filter((candidate) => {
      const cStart = candidate.node.startPosition.row;
      const cEnd = candidate.node.endPosition.row;
      const cLen = candidate.node.text.length;

      // (a) Skip children whose parent fits in one chunk
      for (const other of capturedNodes) {
        if (other === candidate) continue;
        const oStart = other.node.startPosition.row;
        const oEnd = other.node.endPosition.row;

        const isContained = oStart <= cStart && oEnd >= cEnd &&
          !(oStart === cStart && oEnd === cEnd);

        if (isContained && other.node.text.length <= maxAllowed) {
          return false;
        }
      }

      // (b) Skip oversized parents that have children in the capture list
      if (cLen > maxAllowed) {
        const hasChildren = capturedNodes.some((other) => {
          if (other === candidate) return false;
          const oStart = other.node.startPosition.row;
          const oEnd = other.node.endPosition.row;
          return oStart >= cStart && oEnd <= cEnd &&
            !(oStart === cStart && oEnd === cEnd);
        });
        if (hasChildren) return false;
      }

      return true;
    });

    // 3. Process AST-captured nodes into chunks (with signature prefix for large ones)
    const astChunks = processAstNodes(filteredNodes, filePath, fileHash, content, seenSegmentHashes);

    if (astChunks.length === 0) {
      return chunkFile(filePath, content, fileHash);
    }

    // 4. Fill gaps between AST chunks (imports, comments, top-level code)
    const allLines = content.split('\n');
    const gapChunks = fillGaps(astChunks, allLines, filePath, fileHash, seenSegmentHashes);

    // 5. Combine, sort by start line, and greedy-merge small adjacent chunks
    const allChunks = [...astChunks, ...gapChunks].sort((a, b) => a.start_line - b.start_line);
    return mergeSmallChunks(allChunks, fileHash);
  } catch {
    return chunkFile(filePath, content, fileHash);
  }
}
